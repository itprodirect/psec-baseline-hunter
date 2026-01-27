/**
 * Prompt Templates for Scorecard Summaries
 * Generates personalized security explanations based on user profile
 */

import { ScorecardData, RiskPort } from "@/lib/types";
import {
  UserProfile,
  TechnicalLevel,
  REDACTED_PLACEHOLDER,
  TECHNICAL_LEVEL_LABELS,
  PROFESSION_LABELS,
  CONTEXT_FACTOR_LABELS,
  TONE_LABELS,
} from "@/lib/types/userProfile";
import { RISK_DESCRIPTIONS, P0_ACTIONS, PORT_SERVICE_NAMES } from "@/lib/constants/risk-ports";

/**
 * Build the system prompt based on user profile
 */
export function buildSystemPrompt(profile: UserProfile): string {
  const techLevel = TECHNICAL_LEVEL_LABELS[profile.technicalLevel];
  const profession = PROFESSION_LABELS[profile.profession];
  const tone = TONE_LABELS[profile.tone];

  const contextDescriptions = profile.contextFactors
    .map((f) => CONTEXT_FACTOR_LABELS[f].description)
    .join(", ");

  return `You are a cybersecurity advisor creating a personalized security report for a network scan.

AUDIENCE PROFILE:
- Technical Level: ${techLevel.label} (${techLevel.description})
- Role: ${profession.label} (${profession.description})
- Context: ${contextDescriptions || "General use"}
- Preferred Tone: ${tone.label} (${tone.description})

WRITING GUIDELINES:
1. Adjust technical language to match their level - ${getTechnicalGuidance(profile.technicalLevel)}
2. Frame risks in terms of their specific context and profession
3. Use the ${tone.label.toLowerCase()} tone throughout
4. Be specific and actionable - avoid vague warnings
5. If IPs are marked as ${REDACTED_PLACEHOLDER}, refer to them as "affected device" or "a device on your network"

OUTPUT FORMAT (use these exact headings in markdown):

## Executive Summary
3-5 bullet points summarizing the scan results in plain language

## Why This Matters for You
2-3 sentences explaining the implications for their specific situation (${profession.label})

## Top 3 Actions (Do These First)
Numbered list with specific, actionable steps they can take or delegate

## What Could Happen If Ignored
Brief, honest explanation of realistic risks without fear-mongering

## Questions I Have for You
2-3 questions that would help refine the recommendations (e.g., "Is the RDP access intentional for remote work?")

## Notes / Limitations
Brief note about what this scan does and doesn't tell us`;
}

/**
 * Get technical language guidance based on level
 */
function getTechnicalGuidance(level: TechnicalLevel): string {
  switch (level) {
    case "non-technical":
      return "Avoid all jargon. Use analogies (e.g., 'like leaving a door unlocked'). Spell out acronyms.";
    case "some-technical":
      return "Define technical terms briefly when first used. Use common analogies.";
    case "technical":
      return "Technical terms are OK but explain security-specific concepts.";
    case "security-professional":
      return "Use standard security terminology. Include CVE references if relevant.";
  }
}

/**
 * Redact sensitive information from scorecard data
 */
export function redactScorecardData(
  data: ScorecardData,
  includeDetails: boolean
): ScorecardData {
  if (includeDetails) {
    return data;
  }

  return {
    ...data,
    riskPortsDetail: data.riskPortsDetail.map((rp) => ({
      ...rp,
      hosts: rp.hosts.map(() => REDACTED_PLACEHOLDER),
    })),
    topPorts: data.topPorts,
  };
}

/**
 * Build the user prompt with scan data
 */
export function buildUserPrompt(
  data: ScorecardData,
  profile: UserProfile
): string {
  const redactedData = redactScorecardData(data, profile.includeNetworkDetails);

  const contextFactorsList = profile.contextFactors
    .map((f) => `- ${CONTEXT_FACTOR_LABELS[f].label}`)
    .join("\n");

  let prompt = `Please analyze this network security scan and create a personalized report.

NETWORK SCAN RESULTS:
- Network: ${redactedData.network}
- Scan Date: ${new Date(redactedData.timestamp).toLocaleDateString()}
- Total Hosts Discovered: ${redactedData.totalHosts}
- Open Ports Found: ${redactedData.openPorts}
- Unique Services Running: ${redactedData.uniqueServices}
- Risk Ports Detected: ${redactedData.riskPorts}

CURRENT SUMMARY: ${redactedData.summary}

`;

  // Add risk port details
  if (redactedData.riskPortsDetail.length > 0) {
    prompt += `RISK EXPOSURES FOUND:\n`;
    for (const rp of redactedData.riskPortsDetail) {
      const riskDesc = RISK_DESCRIPTIONS[rp.risk];
      const action = P0_ACTIONS[rp.port] || "Review and restrict access";
      const serviceName = PORT_SERVICE_NAMES[rp.port] || rp.service || `Port ${rp.port}`;

      const hostList = profile.includeNetworkDetails
        ? rp.hosts.slice(0, 3).join(", ") + (rp.hosts.length > 3 ? ` +${rp.hosts.length - 3} more` : "")
        : `${rp.hostsAffected} device${rp.hostsAffected !== 1 ? "s" : ""}`;

      prompt += `- ${rp.risk} (${riskDesc}): ${serviceName} (port ${rp.port}/${rp.protocol}) on ${hostList}
  Standard Action: ${action}\n`;
    }
    prompt += "\n";
  } else {
    prompt += `RISK EXPOSURES: None detected at P0 or P1 level.\n\n`;
  }

  // Add top ports
  if (redactedData.topPorts.length > 0) {
    prompt += `MOST COMMON OPEN PORTS:\n`;
    for (const tp of redactedData.topPorts.slice(0, 5)) {
      const serviceName = PORT_SERVICE_NAMES[tp.port] || tp.service || `Port ${tp.port}`;
      prompt += `- ${serviceName} (${tp.port}/${tp.protocol}): ${tp.hostsAffected} host${tp.hostsAffected !== 1 ? "s" : ""}\n`;
    }
    prompt += "\n";
  }

  // Add user context
  if (profile.contextFactors.length > 0) {
    prompt += `USER'S SITUATION:\n${contextFactorsList}\n\n`;
  }

  prompt += `Generate the personalized security report using the format specified in your instructions.`;

  return prompt;
}

/**
 * Generate a rule-based fallback summary when no LLM is available
 */
export function generateRuleBasedSummary(
  data: ScorecardData,
  profile: UserProfile
): string {
  const p0Ports = data.riskPortsDetail.filter((r) => r.risk === "P0");
  const p1Ports = data.riskPortsDetail.filter((r) => r.risk === "P1");

  let summary = `## Executive Summary\n\n`;

  if (p0Ports.length === 0 && p1Ports.length === 0) {
    summary += `- Your network scan found ${data.totalHosts} devices with ${data.openPorts} open connections\n`;
    summary += `- No critical security issues were detected\n`;
    summary += `- Standard services are running normally\n`;
    summary += `- Continue regular security monitoring\n\n`;
  } else {
    summary += `- Scan found ${data.totalHosts} devices with ${data.openPorts} open connections\n`;
    if (p0Ports.length > 0) {
      summary += `- **${p0Ports.length} critical issue${p0Ports.length !== 1 ? "s" : ""} requiring immediate attention**\n`;
    }
    if (p1Ports.length > 0) {
      summary += `- ${p1Ports.length} additional issue${p1Ports.length !== 1 ? "s" : ""} to review\n`;
    }
    summary += `- Action is recommended before these become security incidents\n\n`;
  }

  summary += `## Why This Matters for You\n\n`;
  summary += getContextualRisk(profile, p0Ports);
  summary += `\n\n`;

  summary += `## Top 3 Actions (Do These First)\n\n`;
  const actions = generatePersonalizedActions(data, profile);
  actions.forEach((action, i) => {
    summary += `${i + 1}. ${action}\n`;
  });
  summary += `\n`;

  summary += `## What Could Happen If Ignored\n\n`;
  summary += getConsequences(profile, p0Ports);
  summary += `\n\n`;

  summary += `## Questions I Have for You\n\n`;
  summary += getQuestions(data);
  summary += `\n`;

  summary += `## Notes / Limitations\n\n`;
  summary += `This scan shows what network services are visible from the scan location. `;
  summary += `It does not test for vulnerabilities or check if services are properly secured. `;
  summary += `Some open ports may be intentional and necessary for your operations.`;

  return summary;
}

/**
 * Get contextual risk explanation based on profession
 */
function getContextualRisk(profile: UserProfile, p0Ports: RiskPort[]): string {
  const hasClientData = profile.contextFactors.includes("handles-client-data");
  const hasFinancialData = profile.contextFactors.includes("handles-financial-data");
  const hasHealthData = profile.contextFactors.includes("handles-health-records");
  const hasPayments = profile.contextFactors.includes("accepts-payments");

  if (p0Ports.length === 0) {
    return `As a ${PROFESSION_LABELS[profile.profession].label.toLowerCase()}, maintaining a clean security posture helps protect your operations and reputation. This scan shows your network is not exposing obvious high-risk services.`;
  }

  let risk = `As a ${PROFESSION_LABELS[profile.profession].label.toLowerCase()}`;

  if (hasHealthData) {
    risk += `, you're subject to HIPAA requirements. These exposures could lead to compliance violations and reportable breaches`;
  } else if (hasFinancialData || hasPayments) {
    risk += `, you handle financial information. These exposures could allow unauthorized access to sensitive data`;
  } else if (hasClientData) {
    risk += `, you hold client information. These exposures could put that data at risk`;
  } else {
    risk += `, these exposures could allow unauthorized access to your systems`;
  }

  risk += `. The most urgent issue is ${PORT_SERVICE_NAMES[p0Ports[0].port] || `port ${p0Ports[0].port}`} being accessible.`;

  return risk;
}

/**
 * Generate personalized action items
 */
function generatePersonalizedActions(data: ScorecardData, profile: UserProfile): string[] {
  const actions: string[] = [];
  const p0Ports = data.riskPortsDetail.filter((r) => r.risk === "P0");
  const p1Ports = data.riskPortsDetail.filter((r) => r.risk === "P1");

  const isNonTechnical = profile.technicalLevel === "non-technical" || profile.technicalLevel === "some-technical";

  for (const rp of p0Ports.slice(0, 2)) {
    const serviceName = PORT_SERVICE_NAMES[rp.port] || `Port ${rp.port}`;
    const baseAction = P0_ACTIONS[rp.port] || "Block this port at your firewall";

    if (isNonTechnical) {
      actions.push(`**${serviceName}**: Ask your IT provider to ${baseAction.toLowerCase()}. This is your top priority.`);
    } else {
      actions.push(`**${serviceName}** (${rp.port}/${rp.protocol}): ${baseAction}`);
    }
  }

  for (const rp of p1Ports.slice(0, 3 - actions.length)) {
    const serviceName = PORT_SERVICE_NAMES[rp.port] || rp.service || `Port ${rp.port}`;
    if (isNonTechnical) {
      actions.push(`**${serviceName}**: Have someone check if this should be accessible from outside your network.`);
    } else {
      actions.push(`**${serviceName}** (${rp.port}): Review access controls and restrict to authorized users only.`);
    }
  }

  if (actions.length === 0) {
    if (isNonTechnical) {
      actions.push("No urgent actions needed. Keep your systems updated.");
      actions.push("Consider scheduling regular security scans (monthly or quarterly).");
      actions.push("Make sure you have good backups of important data.");
    } else {
      actions.push("Maintain current security posture with regular patching.");
      actions.push("Schedule periodic vulnerability assessments.");
      actions.push("Review and document intentionally exposed services.");
    }
  }

  return actions.slice(0, 3);
}

/**
 * Get consequences explanation
 */
function getConsequences(profile: UserProfile, p0Ports: RiskPort[]): string {
  if (p0Ports.length === 0) {
    return `While no critical issues were found, security is ongoing. Without regular monitoring, new exposures could develop unnoticed.`;
  }

  const hasClientData = profile.contextFactors.includes("handles-client-data");
  const hasHealthData = profile.contextFactors.includes("handles-health-records");
  const hasPayments = profile.contextFactors.includes("accepts-payments");

  let consequence = `These exposed services are common targets for automated attacks. `;

  if (hasHealthData) {
    consequence += `A breach could trigger HIPAA notification requirements, fines, and damage to patient trust.`;
  } else if (hasPayments) {
    consequence += `Attackers could potentially access payment systems, leading to financial loss and PCI compliance issues.`;
  } else if (hasClientData) {
    consequence += `Client data exposure could result in notification obligations, legal liability, and reputation damage.`;
  } else {
    consequence += `Attackers could gain access to your systems, potentially leading to data theft or ransomware.`;
  }

  return consequence;
}

/**
 * Generate clarifying questions
 */
function getQuestions(data: ScorecardData): string {
  const questions: string[] = [];
  const riskPorts = data.riskPortsDetail;

  // Check for RDP
  if (riskPorts.some((r) => r.port === 3389)) {
    questions.push(`- Is Remote Desktop (RDP) access intentional for remote work? If so, is it protected by VPN?`);
  }

  // Check for database ports
  if (riskPorts.some((r) => [3306, 5432, 1433, 27017].includes(r.port))) {
    questions.push(`- Do any external applications need direct database access, or should this be internal only?`);
  }

  // Check for SMB
  if (riskPorts.some((r) => r.port === 445)) {
    questions.push(`- Is file sharing needed from outside your local network?`);
  }

  // Generic questions if none specific
  if (questions.length === 0) {
    questions.push(`- Are all ${data.totalHosts} discovered devices known and authorized on your network?`);
    if (data.openPorts > 20) {
      questions.push(`- With ${data.openPorts} open ports, would you like help prioritizing which services to review first?`);
    }
    questions.push(`- When was your last security review or IT assessment?`);
  }

  return questions.slice(0, 3).join("\n");
}

/**
 * Request payload for the API
 */
export interface ScorecardSummaryRequest {
  scorecardData: ScorecardData;
  userProfile: UserProfile;
}

/**
 * Response payload from the API
 */
export interface ScorecardSummaryResponse {
  success: boolean;
  summary?: string;
  provider?: string;
  isRuleBased?: boolean;
  error?: string;
}
