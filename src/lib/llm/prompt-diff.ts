/**
 * Prompt Templates for Diff Summaries
 * Generates personalized explanations of what changed between two scans
 */

import { DiffData, PortChange } from "@/lib/types";
import {
  UserProfile,
  REDACTED_PLACEHOLDER,
  TECHNICAL_LEVEL_LABELS,
  PROFESSION_LABELS,
  CONTEXT_FACTOR_LABELS,
  TONE_LABELS,
} from "@/lib/types/userProfile";
import { PORT_SERVICE_NAMES } from "@/lib/constants/risk-ports";

/**
 * Build the system prompt for diff explanations
 */
export function buildDiffSystemPrompt(profile: UserProfile): string {
  const techLevel = TECHNICAL_LEVEL_LABELS[profile.technicalLevel];
  const profession = PROFESSION_LABELS[profile.profession];
  const tone = TONE_LABELS[profile.tone];

  const contextDescriptions = profile.contextFactors
    .map((f) => CONTEXT_FACTOR_LABELS[f].description)
    .join(", ");

  return `You are a cybersecurity advisor explaining what changed between two network scans.

AUDIENCE PROFILE:
- Technical Level: ${techLevel.label} (${techLevel.description})
- Role: ${profession.label} (${profession.description})
- Context: ${contextDescriptions || "General use"}
- Preferred Tone: ${tone.label} (${tone.description})

WRITING GUIDELINES:
1. Focus on CHANGES - what's different now vs before
2. Explain implications of each significant change
3. Prioritize new risks over improvements
4. Use the ${tone.label.toLowerCase()} tone throughout
5. If IPs are marked as ${REDACTED_PLACEHOLDER}, refer to them as "a device" or "affected system"

OUTPUT FORMAT (use these exact headings in markdown):

## What Changed (Summary)
3-5 bullet points summarizing the key changes in plain language

## What This Means for You
2-3 sentences explaining the implications for their specific situation (${profession.label})

## Actions to Take
Numbered list with specific steps - prioritize new risks

## Good News
Brief mention of any positive changes (ports closed, hosts removed if intentional)

## Questions About These Changes
2-3 questions that would help understand if these changes were intentional

## Notes
Brief note about what this comparison does and doesn't tell us`;
}

/**
 * Redact sensitive information from diff data
 */
export function redactDiffData(data: DiffData, includeDetails: boolean): DiffData {
  if (includeDetails) {
    return data;
  }

  return {
    ...data,
    newHosts: data.newHosts.map((h) => ({
      ...h,
      ip: REDACTED_PLACEHOLDER,
      hostname: h.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    removedHosts: data.removedHosts.map((h) => ({
      ...h,
      ip: REDACTED_PLACEHOLDER,
      hostname: h.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    portsOpened: data.portsOpened.map((p) => ({
      ...p,
      ip: REDACTED_PLACEHOLDER,
      hostname: p.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    portsClosed: data.portsClosed.map((p) => ({
      ...p,
      ip: REDACTED_PLACEHOLDER,
      hostname: p.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    riskyExposures: data.riskyExposures.map((p) => ({
      ...p,
      ip: REDACTED_PLACEHOLDER,
      hostname: p.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
  };
}

/**
 * Build the user prompt with diff data
 */
export function buildDiffUserPrompt(data: DiffData, profile: UserProfile): string {
  const redactedData = redactDiffData(data, profile.includeNetworkDetails);

  const formatDate = (ts: string) => new Date(ts).toLocaleDateString();

  let prompt = `Please analyze these network changes and create a personalized report.

COMPARISON DETAILS:
- Network: ${redactedData.network}
- Baseline Scan: ${formatDate(redactedData.baselineTimestamp)}
- Current Scan: ${formatDate(redactedData.currentTimestamp)}

CHANGE SUMMARY:
- New hosts appeared: ${redactedData.newHosts.length}
- Hosts removed/offline: ${redactedData.removedHosts.length}
- Ports newly opened: ${redactedData.portsOpened.length}
- Ports closed: ${redactedData.portsClosed.length}
- Critical (P0) new exposures: ${redactedData.riskyExposures.length}

CURRENT SUMMARY: ${redactedData.summary}

`;

  // Add critical exposures detail
  if (redactedData.riskyExposures.length > 0) {
    prompt += `NEW CRITICAL EXPOSURES (Require Immediate Attention):\n`;
    for (const p of redactedData.riskyExposures) {
      const serviceName = PORT_SERVICE_NAMES[p.port] || p.service || `Port ${p.port}`;
      prompt += `- ${p.risk}: ${serviceName} (${p.port}/${p.protocol}) on ${p.ip}${p.hostname ? ` (${p.hostname})` : ""}\n`;
    }
    prompt += "\n";
  }

  // Add new ports opened
  if (redactedData.portsOpened.length > 0) {
    prompt += `ALL NEWLY OPENED PORTS:\n`;
    for (const p of redactedData.portsOpened.slice(0, 10)) {
      const serviceName = PORT_SERVICE_NAMES[p.port] || p.service || `Port ${p.port}`;
      prompt += `- ${serviceName} (${p.port}/${p.protocol}) on ${p.ip}${p.risk ? ` [${p.risk}]` : ""}\n`;
    }
    if (redactedData.portsOpened.length > 10) {
      prompt += `  ... and ${redactedData.portsOpened.length - 10} more\n`;
    }
    prompt += "\n";
  }

  // Add new hosts
  if (redactedData.newHosts.length > 0) {
    prompt += `NEW HOSTS DISCOVERED:\n`;
    for (const h of redactedData.newHosts.slice(0, 5)) {
      prompt += `- ${h.ip}${h.hostname ? ` (${h.hostname})` : ""}\n`;
    }
    if (redactedData.newHosts.length > 5) {
      prompt += `  ... and ${redactedData.newHosts.length - 5} more\n`;
    }
    prompt += "\n";
  }

  // Add positive changes
  if (redactedData.portsClosed.length > 0 || redactedData.removedHosts.length > 0) {
    prompt += `POSITIVE CHANGES (if intentional):\n`;
    if (redactedData.portsClosed.length > 0) {
      prompt += `- ${redactedData.portsClosed.length} ports were closed\n`;
    }
    if (redactedData.removedHosts.length > 0) {
      prompt += `- ${redactedData.removedHosts.length} hosts went offline or were decommissioned\n`;
    }
    prompt += "\n";
  }

  // Add user context
  if (profile.contextFactors.length > 0) {
    const contextDescriptions = profile.contextFactors
      .map((f) => `- ${CONTEXT_FACTOR_LABELS[f].label}`)
      .join("\n");
    prompt += `USER'S SITUATION:\n${contextDescriptions}\n\n`;
  }

  prompt += `Generate the personalized change report using the format specified in your instructions.`;

  return prompt;
}

/**
 * Generate a rule-based fallback summary for diff
 */
export function generateRuleBasedDiffSummary(data: DiffData, profile: UserProfile): string {
  const profession = PROFESSION_LABELS[profile.profession].label;
  const p0Exposures = data.riskyExposures.filter((r) => r.risk === "P0");

  let summary = `## What Changed (Summary)\n\n`;

  summary += `- ${data.newHosts.length} new device${data.newHosts.length !== 1 ? "s" : ""} appeared on your network\n`;
  summary += `- ${data.removedHosts.length} device${data.removedHosts.length !== 1 ? "s" : ""} went offline or were removed\n`;
  summary += `- ${data.portsOpened.length} new port${data.portsOpened.length !== 1 ? "s" : ""} opened (services started)\n`;
  summary += `- ${data.portsClosed.length} port${data.portsClosed.length !== 1 ? "s" : ""} closed (services stopped)\n`;

  if (p0Exposures.length > 0) {
    summary += `- **${p0Exposures.length} critical security exposure${p0Exposures.length !== 1 ? "s" : ""} detected**\n`;
  }

  summary += `\n## What This Means for You\n\n`;

  if (p0Exposures.length === 0 && data.portsOpened.length === 0 && data.newHosts.length === 0) {
    summary += `As a ${profession.toLowerCase()}, you'll be glad to know your network appears stable. `;
    summary += `No new risks were introduced since the last scan.\n`;
  } else if (p0Exposures.length > 0) {
    const topService = PORT_SERVICE_NAMES[p0Exposures[0].port] || `Port ${p0Exposures[0].port}`;
    summary += `As a ${profession.toLowerCase()}, the new ${topService} exposure is concerning. `;
    summary += `This service is commonly targeted by attackers and should be addressed promptly.\n`;
  } else if (data.portsOpened.length > 0) {
    summary += `As a ${profession.toLowerCase()}, review the newly opened ports to confirm they were intentional. `;
    summary += `Unexpected services could indicate configuration drift or unauthorized changes.\n`;
  } else {
    summary += `As a ${profession.toLowerCase()}, the new devices on your network should be verified. `;
    summary += `Make sure you recognize all ${data.newHosts.length} new device${data.newHosts.length !== 1 ? "s" : ""}.\n`;
  }

  summary += `\n## Actions to Take\n\n`;

  const actions: string[] = [];

  if (p0Exposures.length > 0) {
    const service = PORT_SERVICE_NAMES[p0Exposures[0].port] || `Port ${p0Exposures[0].port}`;
    actions.push(`**Block ${service}** at your firewall - this is the top priority`);
  }

  if (data.newHosts.length > 0) {
    actions.push(`Verify the ${data.newHosts.length} new device${data.newHosts.length !== 1 ? "s are" : " is"} authorized`);
  }

  if (data.portsOpened.length > p0Exposures.length) {
    actions.push(`Review the ${data.portsOpened.length - p0Exposures.length} other new ports to confirm they're needed`);
  }

  if (actions.length === 0) {
    actions.push("No immediate actions required");
    actions.push("Continue regular security monitoring");
  }

  actions.forEach((action, i) => {
    summary += `${i + 1}. ${action}\n`;
  });

  summary += `\n## Good News\n\n`;

  if (data.portsClosed.length > 0 || p0Exposures.length === 0) {
    if (data.portsClosed.length > 0) {
      summary += `${data.portsClosed.length} port${data.portsClosed.length !== 1 ? "s were" : " was"} closed since last scan - `;
      summary += `if intentional, this reduces your attack surface.\n`;
    }
    if (p0Exposures.length === 0) {
      summary += `No new critical (P0) exposures were introduced.\n`;
    }
  } else {
    summary += `The comparison itself is useful - you now know exactly what changed.\n`;
  }

  summary += `\n## Questions About These Changes\n\n`;

  if (data.newHosts.length > 0) {
    summary += `- Do you recognize the ${data.newHosts.length} new device${data.newHosts.length !== 1 ? "s" : ""} that appeared?\n`;
  }
  if (data.portsOpened.length > 0) {
    summary += `- Were the newly opened ports part of a planned change?\n`;
  }
  if (data.removedHosts.length > 0) {
    summary += `- Were the ${data.removedHosts.length} offline device${data.removedHosts.length !== 1 ? "s" : ""} intentionally decommissioned?\n`;
  }
  if (data.newHosts.length === 0 && data.portsOpened.length === 0 && data.removedHosts.length === 0) {
    summary += `- When was your last intentional network change?\n`;
    summary += `- Is this level of stability expected for your environment?\n`;
  }

  summary += `\n## Notes\n\n`;
  summary += `This comparison shows changes between two point-in-time scans. `;
  summary += `It cannot detect changes that occurred and reverted between scans, `;
  summary += `or whether changes were authorized.`;

  return summary;
}

/**
 * Request payload for the diff summary API
 */
export interface DiffSummaryRequest {
  diffData: DiffData;
  userProfile: UserProfile;
}

/**
 * Response payload from the diff summary API
 */
export interface DiffSummaryResponse {
  success: boolean;
  summary?: string;
  provider?: string;
  isRuleBased?: boolean;
  error?: string;
}
