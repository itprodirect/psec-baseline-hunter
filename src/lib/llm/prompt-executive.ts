/**
 * Prompt Templates for Executive Summary
 * Generates business-focused security reports for leadership
 */

import { ScorecardData } from "@/lib/types";
import {
  UserProfile,
  PROFESSION_LABELS,
  CONTEXT_FACTOR_LABELS,
} from "@/lib/types/userProfile";
import { RISK_DESCRIPTIONS, PORT_SERVICE_NAMES } from "@/lib/constants/risk-ports";

/**
 * Build system prompt for executive summary (profession-aware, business-focused)
 */
export function buildExecutiveSystemPrompt(profile: UserProfile): string {
  const profession = PROFESSION_LABELS[profile.profession];

  return `You are a cybersecurity advisor preparing an executive summary for business leadership.

AUDIENCE:
- Role: ${profession.label} (${profession.description})
- They need to understand business impact, not technical details
- They may need to brief executives, board members, or stakeholders
- Focus on risk, cost, and actionable decisions

TONE:
- Professional and concise
- Non-technical language (avoid jargon)
- Focus on business consequences
- Be direct about risks but not fear-mongering
- Provide clear, prioritized recommendations

OUTPUT FORMAT (markdown):

# Executive Summary: Network Security Assessment

## Overview
2-3 sentences: What was assessed, when, and the overall security posture in plain language.

## Key Findings
- 3-5 bullet points highlighting the most important discoveries
- Focus on business impact, not technical minutiae
- Use terms like "critical exposure," "potential entry point," "compliance risk"

## Top 3 Business Risks
For each risk, include:
1. **What It Is**: Plain English description (1-2 sentences)
   - **Why It Matters**: Business consequence (costs, reputation, compliance)
   - **Recommended Action**: What leadership should approve/authorize

## Financial Impact Estimate
Brief paragraph on potential breach costs, regulatory fines, and business disruption based on current exposures.

## Recommended Next Steps
Prioritized action plan with owners and rough timelines:
1. Immediate (this week): ...
2. Short-term (this month): ...
3. Ongoing: ...

## Questions for Leadership
2-3 questions that require business decisions (e.g., "Is remote access via RDP a business requirement?")

---

*This report is based on network scanning only and does not include penetration testing or vulnerability assessments.*`;
}

/**
 * Build user prompt for executive summary
 */
export function buildExecutiveUserPrompt(
  data: ScorecardData,
  profile: UserProfile
): string {
  const p0Ports = data.riskPortsDetail.filter((r) => r.risk === "P0");
  const p1Ports = data.riskPortsDetail.filter((r) => r.risk === "P1");

  const contextFactorsList = profile.contextFactors
    .map((f) => `- ${CONTEXT_FACTOR_LABELS[f].label}`)
    .join("\n");

  let prompt = `Prepare an executive summary for this network security assessment.

ORGANIZATION CONTEXT:
- Industry/Role: ${PROFESSION_LABELS[profile.profession].label}
${contextFactorsList ? `- Regulatory/Business Context:\n${contextFactorsList}` : ""}

SCAN RESULTS:
- Network: ${data.network}
- Scan Date: ${new Date(data.timestamp).toLocaleDateString()}
- Total Devices: ${data.totalHosts}
- Open Network Services: ${data.openPorts}
- Critical Exposures (P0): ${p0Ports.length}
- High-Risk Exposures (P1): ${p1Ports.length}

`;

  // Add P0 details (critical)
  if (p0Ports.length > 0) {
    prompt += `CRITICAL EXPOSURES (P0 - Immediate Action Required):\n`;
    for (const rp of p0Ports) {
      const serviceName = PORT_SERVICE_NAMES[rp.port] || rp.service || `Port ${rp.port}`;
      const riskDesc = RISK_DESCRIPTIONS[rp.risk];
      prompt += `- ${serviceName} (port ${rp.port}): ${riskDesc} - Exposed on ${rp.hostsAffected} device${rp.hostsAffected !== 1 ? "s" : ""}\n`;
    }
    prompt += "\n";
  }

  // Add P1 details (high risk)
  if (p1Ports.length > 0) {
    prompt += `HIGH-RISK EXPOSURES (P1 - Review Required):\n`;
    for (const rp of p1Ports) {
      const serviceName = PORT_SERVICE_NAMES[rp.port] || rp.service || `Port ${rp.port}`;
      const riskDesc = RISK_DESCRIPTIONS[rp.risk];
      prompt += `- ${serviceName} (port ${rp.port}): ${riskDesc} - Exposed on ${rp.hostsAffected} device${rp.hostsAffected !== 1 ? "s" : ""}\n`;
    }
    prompt += "\n";
  }

  // Add regulatory considerations
  const hasHealthData = profile.contextFactors.includes("handles-health-records");
  const hasPayments = profile.contextFactors.includes("accepts-payments");
  const hasFinancialData = profile.contextFactors.includes("handles-financial-data");

  if (hasHealthData || hasPayments || hasFinancialData) {
    prompt += `REGULATORY CONSIDERATIONS:\n`;
    if (hasHealthData) {
      prompt += `- HIPAA compliance: Breaches require notification and can result in $50K-$1.5M fines\n`;
    }
    if (hasPayments) {
      prompt += `- PCI-DSS compliance: Payment card breaches can result in fines and loss of merchant status\n`;
    }
    if (hasFinancialData) {
      prompt += `- Financial data protection: State laws may require breach notification\n`;
    }
    prompt += "\n";
  }

  prompt += `Generate the executive summary using the format specified in your instructions.

Focus on helping this ${PROFESSION_LABELS[profile.profession].label.toLowerCase()} understand:
1. What the risks mean for their business
2. What could happen if these aren't addressed
3. What decisions they need to make or authorize
4. Realistic cost and timeline estimates`;

  return prompt;
}

/**
 * Generate rule-based executive summary fallback
 */
export function generateRuleBasedExecutiveSummary(
  data: ScorecardData,
  profile: UserProfile
): string {
  const p0Ports = data.riskPortsDetail.filter((r) => r.risk === "P0");
  const p1Ports = data.riskPortsDetail.filter((r) => r.risk === "P1");

  let summary = `# Executive Summary: Network Security Assessment\n\n`;

  // Overview
  summary += `## Overview\n\n`;
  summary += `This assessment scanned ${data.totalHosts} devices on the ${data.network} network on ${new Date(data.timestamp).toLocaleDateString()}. `;
  if (p0Ports.length > 0) {
    summary += `The scan identified ${p0Ports.length} critical security exposure${p0Ports.length !== 1 ? "s" : ""} requiring immediate attention. `;
  } else if (p1Ports.length > 0) {
    summary += `The scan identified ${p1Ports.length} high-risk exposure${p1Ports.length !== 1 ? "s" : ""} that should be reviewed. `;
  } else {
    summary += `No critical security exposures were detected. `;
  }
  summary += `This report summarizes the business risks and recommended actions.\n\n`;

  // Key Findings
  summary += `## Key Findings\n\n`;
  if (p0Ports.length > 0 || p1Ports.length > 0) {
    summary += `- **${p0Ports.length + p1Ports.length} security exposure${p0Ports.length + p1Ports.length !== 1 ? "s" : ""} detected** across ${data.totalHosts} network devices\n`;
    if (p0Ports.length > 0) {
      summary += `- **${p0Ports.length} critical-risk services** are accessible from outside your network\n`;
    }
    summary += `- These exposures create potential entry points for unauthorized access\n`;

    const hasHealthData = profile.contextFactors.includes("handles-health-records");
    const hasPayments = profile.contextFactors.includes("accepts-payments");
    if (hasHealthData) {
      summary += `- As a healthcare organization, these exposures create HIPAA compliance risk\n`;
    } else if (hasPayments) {
      summary += `- As an organization that accepts payments, PCI-DSS compliance may be affected\n`;
    }

    summary += `- Industry average breach cost: $4.5 million (IBM 2023 report)\n`;
  } else {
    summary += `- Scan found ${data.totalHosts} active devices with ${data.openPorts} open network services\n`;
    summary += `- No critical or high-risk exposures detected at perimeter\n`;
    summary += `- Current security posture appears acceptable for continued operations\n`;
    summary += `- Regular monitoring recommended to maintain this baseline\n`;
  }
  summary += `\n`;

  // Top 3 Business Risks
  summary += `## Top 3 Business Risks\n\n`;
  const risks: Array<{ name: string; why: string; action: string }> = [];

  for (const rp of p0Ports.slice(0, 3)) {
    const serviceName = PORT_SERVICE_NAMES[rp.port] || rp.service || `Port ${rp.port}`;
    let why = "";
    let action = "";

    if (rp.port === 3389) {
      why = "Remote Desktop provides complete control of systems. Exposed RDP is the #1 entry point for ransomware attacks. Average ransomware recovery cost: $1.85M (Sophos).";
      action = "Immediately block external RDP access. Implement VPN for remote access. Enable multi-factor authentication.";
    } else if (rp.port === 445) {
      why = "File sharing protocol heavily exploited by ransomware (WannaCry, NotPetya). Direct internet exposure of SMB has led to billions in damages globally.";
      action = "Block SMB at firewall immediately. SMB should never be internet-accessible. Assess if any devices were compromised.";
    } else if (rp.port === 23) {
      why = "Telnet sends passwords in plain text, making them trivially easy to intercept. Commonly exploited to build botnets and launch attacks.";
      action = "Disable Telnet entirely. Replace with SSH (encrypted) or isolate devices from the internet.";
    } else {
      why = `This service is exposed to the internet and represents a potential attack vector. ${RISK_DESCRIPTIONS[rp.risk]}`;
      action = `Review whether ${serviceName} needs internet access. If not, restrict to internal network only.`;
    }

    risks.push({
      name: `${serviceName} Exposed (${rp.hostsAffected} device${rp.hostsAffected !== 1 ? "s" : ""})`,
      why,
      action
    });
  }

  // Fill remaining with P1 if needed
  for (const rp of p1Ports.slice(0, 3 - risks.length)) {
    const serviceName = PORT_SERVICE_NAMES[rp.port] || rp.service || `Port ${rp.port}`;
    risks.push({
      name: `${serviceName} Accessible (${rp.hostsAffected} device${rp.hostsAffected !== 1 ? "s" : ""})`,
      why: `Admin or development interfaces exposed to the internet often have weaker security than production systems. These are targeted by attackers seeking configuration data or access credentials.`,
      action: `Verify this interface should be publicly accessible. If it's for administration or development, restrict to VPN or office IP addresses.`
    });
  }

  if (risks.length === 0) {
    summary += `No critical business risks identified in this assessment. Your network perimeter appears properly secured.\n\n`;
  } else {
    risks.forEach((risk, idx) => {
      summary += `### ${idx + 1}. ${risk.name}\n\n`;
      summary += `**Why It Matters**: ${risk.why}\n\n`;
      summary += `**Recommended Action**: ${risk.action}\n\n`;
    });
  }

  // Financial Impact
  summary += `## Financial Impact Estimate\n\n`;
  if (p0Ports.length > 0) {
    summary += `Based on current exposures and industry data:\n\n`;
    summary += `- **Average data breach cost**: $4.5M (IBM 2023)\n`;
    summary += `- **Ransomware recovery cost**: $1.85M average (Sophos 2023)\n`;
    summary += `- **Recovery timeline**: 200-280 days average\n`;

    const hasHealthData = profile.contextFactors.includes("handles-health-records");
    const hasPayments = profile.contextFactors.includes("accepts-payments");
    if (hasHealthData) {
      summary += `- **HIPAA penalties**: $50,000 to $1.5M per violation\n`;
    } else if (hasPayments) {
      summary += `- **PCI-DSS fines**: $5,000 to $100,000 per month of non-compliance\n`;
    }

    summary += `\nThe critical exposures identified significantly increase breach probability. Addressing these issues now is substantially more cost-effective than incident response.\n\n`;
  } else if (p1Ports.length > 0) {
    summary += `While no critical exposures were found, the high-risk items identified should be reviewed. Industry average breach cost is $4.5M, with recovery taking 200+ days. Proactive security measures are always more cost-effective than incident response.\n\n`;
  } else {
    summary += `Current security posture reduces breach probability. Continue investing in regular security assessments and monitoring to maintain this baseline. Industry average breach cost ($4.5M) demonstrates the value of prevention.\n\n`;
  }

  // Recommended Next Steps
  summary += `## Recommended Next Steps\n\n`;
  if (p0Ports.length > 0) {
    summary += `**Immediate (This Week)**:\n`;
    summary += `1. Block critical exposures at firewall (${p0Ports.map(rp => PORT_SERVICE_NAMES[rp.port] || `port ${rp.port}`).join(", ")})\n`;
    summary += `2. Verify no unauthorized access has occurred (check logs)\n`;
    summary += `3. Document business requirements for any services that must remain accessible\n\n`;

    summary += `**Short-term (This Month)**:\n`;
    summary += `1. Implement VPN for legitimate remote access needs\n`;
    summary += `2. Review and harden remaining exposed services\n`;
    summary += `3. Enable multi-factor authentication for admin access\n\n`;
  } else if (p1Ports.length > 0) {
    summary += `**Short-term (This Month)**:\n`;
    summary += `1. Review each exposed service to confirm business need\n`;
    summary += `2. Restrict administrative interfaces to VPN or specific IP ranges\n`;
    summary += `3. Enable strong authentication on all exposed services\n\n`;
  }

  summary += `**Ongoing**:\n`;
  summary += `1. Conduct quarterly network scans to detect new exposures\n`;
  summary += `2. Implement security awareness training for staff\n`;
  summary += `3. Maintain incident response plan and backups\n\n`;

  // Questions for Leadership
  summary += `## Questions for Leadership\n\n`;
  if (p0Ports.some(rp => rp.port === 3389)) {
    summary += `1. Is Remote Desktop (RDP) access a business requirement? If so, can we require VPN for access?\n`;
  }
  if (p1Ports.length > 0) {
    summary += `${p0Ports.some(rp => rp.port === 3389) ? "2" : "1"}. Do we have an inventory of all services that should be externally accessible? Can we establish a change control process?\n`;
  }
  const questionNum = (p0Ports.some(rp => rp.port === 3389) ? 2 : 1) + (p1Ports.length > 0 ? 1 : 0);
  summary += `${questionNum + 1}. What is our acceptable downtime window for implementing security changes?\n\n`;

  summary += `---\n\n`;
  summary += `*This report is based on network scanning only and does not include penetration testing or vulnerability assessments.*\n`;

  return summary;
}
