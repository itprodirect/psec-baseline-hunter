/**
 * Evidence-bounded prompt templates for Diff summaries.
 */

import type { DiffData } from "@/lib/types";
import {
  type UserProfile,
  REDACTED_PLACEHOLDER,
  TECHNICAL_LEVEL_LABELS,
  PROFESSION_LABELS,
  CONTEXT_FACTOR_LABELS,
  TONE_LABELS,
} from "@/lib/types/userProfile";
import { PORT_SERVICE_NAMES } from "@/lib/constants/risk-ports";

function evidenceLimitations(data: DiffData): string {
  return data.evidence.limitations.length > 0
    ? data.evidence.limitations.map((limitation) => `- ${limitation}`).join("\n")
    : "- No additional limitations were recorded.";
}

/** Build the system prompt for a comparison explanation. */
export function buildDiffSystemPrompt(profile: UserProfile): string {
  const techLevel = TECHNICAL_LEVEL_LABELS[profile.technicalLevel];
  const profession = PROFESSION_LABELS[profile.profession];
  const tone = TONE_LABELS[profile.tone];

  return `You are a cybersecurity advisor reporting only conclusions supported by two network observations.

AUDIENCE:
- Technical level: ${techLevel.label} (${techLevel.description})
- Role: ${profession.label} (${profession.description})
- Tone: ${tone.label} (${tone.description})

EVIDENCE RULES (mandatory):
1. Treat the supplied evidence status, support flags, and limitations as authoritative.
2. Never convert a missing, partial, incompatible, or uncertain observation into a device-removal, service-closure, no-change, or persistent-identity conclusion.
3. An IP address or other network locator alone does not establish persistent device identity.
4. An internally observed service does not establish Internet exposure, external reachability, perimeter failure, compromise, incident likelihood, or monetary impact.
5. A P0 classification means an observed service requires review; it is not proof of exposure or compromise.
6. A zero count is limited to the recorded observations. Never turn it into an all-clear, a no-risk claim, or a claim that the environment is stable or operating normally.
7. Do not invent facts, probabilities, costs, compliance consequences, or positive reassurance.
8. If an address is ${REDACTED_PLACEHOLDER}, call it "a device" and do not attempt to reconstruct it.

OUTPUT FORMAT (markdown):
## Evidence Status
State the exact status and the material limitations first.

## Observed Changes
Report only the supported changes and explicitly label identity uncertainty.

## Review Actions
Give verification-oriented actions tied to observed facts.

## Questions
Ask concise questions that would establish intent or stronger evidence.

## Limits
Restate what the collection vantage cannot establish.`;
}

/** Redact addresses and hostnames before data is sent to a provider. */
export function redactDiffData(data: DiffData, includeDetails: boolean): DiffData {
  if (includeDetails) return data;

  return {
    ...data,
    network: REDACTED_PLACEHOLDER,
    newHosts: data.newHosts.map((host) => ({
      ...host,
      ip: REDACTED_PLACEHOLDER,
      hostname: host.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    removedHosts: data.removedHosts.map((host) => ({
      ...host,
      ip: REDACTED_PLACEHOLDER,
      hostname: host.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    identityUncertain: data.identityUncertain.map((change) => ({
      ...change,
      baselineIp: change.baselineIp ? REDACTED_PLACEHOLDER : undefined,
      currentIp: change.currentIp ? REDACTED_PLACEHOLDER : undefined,
      baselineHostname: change.baselineHostname ? REDACTED_PLACEHOLDER : undefined,
      currentHostname: change.currentHostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    portsOpened: data.portsOpened.map((port) => ({
      ...port,
      ip: REDACTED_PLACEHOLDER,
      hostname: port.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    portsClosed: data.portsClosed.map((port) => ({
      ...port,
      ip: REDACTED_PLACEHOLDER,
      hostname: port.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
    riskFindings: data.riskFindings.map((port) => ({
      ...port,
      ip: REDACTED_PLACEHOLDER,
      hostname: port.hostname ? REDACTED_PLACEHOLDER : undefined,
    })),
  };
}

/** Build an evidence-explicit user prompt from server-recomputed Diff data. */
export function buildDiffUserPrompt(data: DiffData, profile: UserProfile): string {
  const redacted = redactDiffData(data, profile.includeNetworkDetails);
  const context = profile.contextFactors
    .map((factor) => `- ${CONTEXT_FACTOR_LABELS[factor].label}`)
    .join("\n");
  const riskDetails = redacted.riskFindings.length
    ? redacted.riskFindings
        .slice(0, 10)
        .map((finding) => {
          const service = PORT_SERVICE_NAMES[finding.port] || finding.service || `Port ${finding.port}`;
          return `- ${finding.risk || "unclassified"}: ${service} (${finding.port}/${finding.protocol}) on ${finding.ip}`;
        })
        .join("\n")
    : "- No P0/P1-classified service change was recorded in this comparison.";

  return `Create a bounded comparison report from the evidence below.

EVIDENCE CONTRACT:
- Version: ${redacted.evidence.version}
- Status: ${redacted.evidence.status}
- Reason codes: ${redacted.evidence.reasonCodes.join(", ") || "none"}
- Identity status: ${redacted.evidence.identity.status}
- Identity relationships remaining uncertain: ${redacted.evidence.identity.uncertainCount}
- Supports device-absence conclusions: ${redacted.evidence.supports.deviceAbsence}
- Supports service-closure conclusions: ${redacted.evidence.supports.portClosure}
- Supports a stable-baseline conclusion: ${redacted.evidence.supports.stableBaseline}
- Establishes reachability beyond the scan vantage: ${redacted.evidence.supports.externalReachability}
- External reachability is not established by these observations.

LIMITATIONS:
${evidenceLimitations(redacted)}

RECORDED COMPARISON:
- Network: ${redacted.network}
- Baseline observation: ${redacted.baselineTimestamp}
- Current observation: ${redacted.currentTimestamp}
- New devices supported by identity evidence: ${redacted.newHosts.length}
- Device absences supported by coverage and identity evidence: ${redacted.removedHosts.length}
- Uncertain identity relationships: ${redacted.identityUncertain.length}
- Newly observed services: ${redacted.portsOpened.length}
- Service closures supported by coverage evidence: ${redacted.portsClosed.length}
- P0/P1-classified service observations requiring review: ${redacted.riskFindings.length}
- Server summary: ${redacted.summary}

REVIEW-CLASSIFIED SERVICE OBSERVATIONS:
${riskDetails}

USER CONTEXT:
${context || "- General use"}

Use the required headings. Preserve every evidence limitation and do not strengthen the conclusions.`;
}

/** Generate an evidence-bounded fallback without invoking a provider. */
export function generateRuleBasedDiffSummary(data: DiffData, profile: UserProfile): string {
  void profile;
  let summary = `## Evidence Status\n\n`;
  summary += `Status: **${data.evidence.status}** (${data.evidence.version}).\n\n`;
  summary += data.evidence.limitations.map((limitation) => `- ${limitation}`).join("\n");
  summary += `\n\n## Observed Changes\n\n`;

  if (!data.evidence.supports.llmSummary) {
    summary += `Insufficient evidence: the available observations do not support a generated comparison narrative. Review the limitations above and collect compatible, complete observations before drawing change conclusions.\n`;
  } else {
    summary += `- ${data.newHosts.length} device addition${data.newHosts.length === 1 ? "" : "s"} supported by the recorded identity evidence\n`;
    summary += `- ${data.removedHosts.length} device absence${data.removedHosts.length === 1 ? "" : "s"} supported by the recorded coverage and identity evidence\n`;
    summary += `- ${data.portsOpened.length} newly observed service${data.portsOpened.length === 1 ? "" : "s"}\n`;
    summary += `- ${data.portsClosed.length} service closure${data.portsClosed.length === 1 ? "" : "s"} supported by the recorded coverage evidence\n`;
    summary += `- ${data.riskFindings.length} P0/P1-classified service observation${data.riskFindings.length === 1 ? "" : "s"} requiring review\n`;
    if (
      data.newHosts.length === 0 &&
      data.removedHosts.length === 0 &&
      data.portsOpened.length === 0 &&
      data.portsClosed.length === 0
    ) {
      summary += `\nNo supported changes were recorded between these two observations. This statement is limited to their declared scope and coverage.\n`;
    }
  }

  summary += `\n## Review Actions\n\n`;
  summary += `1. Confirm that each recorded service and device change was intended.\n`;
  summary += `2. Review access controls for every P0/P1-classified service observation.\n`;
  summary += `3. Collect evidence from the appropriate vantage before making reachability or incident conclusions.\n`;
  summary += `\n## Questions\n\n`;
  summary += `- Were the recorded device and service changes planned?\n`;
  summary += `- Do the two observations cover the same declared scope and collection sources?\n`;
  summary += `\n## Limits\n\n`;
  summary += `These observations describe what the collection points recorded. They do not establish reachability beyond those collection points, compromise, likelihood, cost, or overall security.`;
  return summary;
}

/** Request payload for the server-authoritative Diff summary API. */
export interface DiffSummaryRequest {
  baselineRunUid: string;
  currentRunUid: string;
  userProfile?: UserProfile;
}

export interface DiffSummaryResponse {
  success: boolean;
  summary?: string;
  provider?: string;
  isRuleBased?: boolean;
  code?: string;
  error?: string;
}
