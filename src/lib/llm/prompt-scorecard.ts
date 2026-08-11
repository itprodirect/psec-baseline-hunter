/**
 * Evidence-bounded prompt templates for Scorecard summaries.
 */

import type { ScorecardData } from "@/lib/types";
import {
  type UserProfile,
  REDACTED_PLACEHOLDER,
  TECHNICAL_LEVEL_LABELS,
  PROFESSION_LABELS,
  CONTEXT_FACTOR_LABELS,
  TONE_LABELS,
} from "@/lib/types/userProfile";
import { PORT_SERVICE_NAMES } from "@/lib/constants/risk-ports";

/** Build the system prompt for a single-observation report. */
export function buildSystemPrompt(profile: UserProfile): string {
  const technicalLevel = TECHNICAL_LEVEL_LABELS[profile.technicalLevel];
  const profession = PROFESSION_LABELS[profile.profession];
  const tone = TONE_LABELS[profile.tone];

  return `You are a cybersecurity advisor reporting only conclusions supported by one network observation.

AUDIENCE:
- Technical level: ${technicalLevel.label} (${technicalLevel.description})
- Role: ${profession.label} (${profession.description})
- Tone: ${tone.label} (${tone.description})

EVIDENCE RULES (mandatory):
1. State the supplied evidence status and limitations before findings.
2. Missing, partial, or empty observations never establish absence, closure, no change, or an all-clear.
3. An internally observed service does not establish Internet exposure, external reachability, perimeter failure, compromise, incident likelihood, or monetary impact.
4. A P0 classification means an observed service requires review; it is not proof of exposure or compromise.
5. Zero P0/P1 findings means only that none were recorded in this observation. Never call the environment safe, risk-free, stable, healthy, acceptable, or normal.
6. Do not invent facts, vulnerabilities, probabilities, costs, regulatory outcomes, or positive reassurance.
7. If an address is ${REDACTED_PLACEHOLDER}, call it "a device" and do not reconstruct it.

OUTPUT FORMAT (markdown):
## Evidence Status
## Observed Findings
## Why Review Is Needed
## Actions
## Questions
## Limits`;
}

/** Redact network and host identifiers before provider use. */
export function redactScorecardData(data: ScorecardData, includeDetails: boolean): ScorecardData {
  if (includeDetails) return data;
  return {
    ...data,
    network: REDACTED_PLACEHOLDER,
    riskPortsDetail: data.riskPortsDetail.map((riskPort) => ({
      ...riskPort,
      hosts: riskPort.hosts.map(() => REDACTED_PLACEHOLDER),
    })),
  };
}

/** Build an evidence-explicit provider prompt from server-rebuilt Scorecard data. */
export function buildUserPrompt(data: ScorecardData, profile: UserProfile): string {
  const redacted = redactScorecardData(data, profile.includeNetworkDetails);
  const limitations = redacted.evidence.limitations.length
    ? redacted.evidence.limitations.map((limitation) => `- ${limitation}`).join("\n")
    : "- No additional limitations were recorded.";
  const findings = redacted.riskPortsDetail.length
    ? redacted.riskPortsDetail
        .map((finding) => {
          const service = PORT_SERVICE_NAMES[finding.port] || finding.service || `Port ${finding.port}`;
          const hosts = profile.includeNetworkDetails
            ? finding.hosts.slice(0, 3).join(", ")
            : `${finding.hostsAffected} device${finding.hostsAffected === 1 ? "" : "s"}`;
          return `- ${finding.risk}: ${service} (${finding.port}/${finding.protocol}), recorded on ${hosts}`;
        })
        .join("\n")
    : "- No P0/P1-classified services were recorded in this observation.";
  const context = profile.contextFactors
    .map((factor) => `- ${CONTEXT_FACTOR_LABELS[factor].label}`)
    .join("\n");

  return `Create a bounded report from this server-rebuilt Scorecard.

EVIDENCE CONTRACT:
- Version: ${redacted.evidence.version}
- Status: ${redacted.evidence.status}
- Reason codes: ${redacted.evidence.reasonCodes.join(", ") || "none"}
- Coverage status: ${redacted.evidence.coverage.current.status}
- Coverage score: ${redacted.evidence.coverage.current.score}
- Coverage partial: ${redacted.evidence.coverage.current.partial}
- Establishes reachability beyond the scan vantage: ${redacted.evidence.supports.externalReachability}
- External reachability is not established by this observation.

LIMITATIONS:
${limitations}

RECORDED OBSERVATION:
- Network: ${redacted.network}
- Observation time: ${redacted.timestamp}
- Devices recorded: ${redacted.totalHosts}
- Open services recorded: ${redacted.openPorts}
- Unique services recorded: ${redacted.uniqueServices}
- P0/P1-classified service observations requiring review: ${redacted.riskPorts}
- Server summary: ${redacted.summary}

REVIEW-CLASSIFIED SERVICE OBSERVATIONS:
${findings}

USER CONTEXT:
${context || "- General use"}

Use the required headings. Preserve every evidence limitation and do not strengthen the conclusions.`;
}

/** Generate an evidence-bounded fallback without invoking a provider. */
export function generateRuleBasedSummary(data: ScorecardData, profile: UserProfile): string {
  void profile;
  const p0Count = data.riskPortsDetail.filter((finding) => finding.risk === "P0").length;
  const p1Count = data.riskPortsDetail.filter((finding) => finding.risk === "P1").length;
  let summary = `## Evidence Status\n\n`;
  summary += `Status: **${data.evidence.status}** (${data.evidence.version}).\n\n`;
  summary += data.evidence.limitations.map((limitation) => `- ${limitation}`).join("\n");
  summary += `\n\n## Observed Findings\n\n`;

  if (!data.evidence.supports.llmSummary) {
    summary += `Insufficient evidence: the available observation does not support a generated findings narrative. Review the limitations above and collect a complete observation before drawing broader conclusions.\n`;
  } else {
    summary += `- ${data.totalHosts} device${data.totalHosts === 1 ? "" : "s"} recorded\n`;
    summary += `- ${data.openPorts} open service${data.openPorts === 1 ? "" : "s"} recorded\n`;
    summary += `- ${p0Count} P0-classified and ${p1Count} P1-classified service observation${p0Count + p1Count === 1 ? "" : "s"} requiring review\n`;
    if (p0Count + p1Count === 0) {
      summary += `\nNo P0/P1-classified services were recorded. This statement is limited to this observation's declared scope, coverage, and collection point.\n`;
    }
  }

  summary += `\n## Why Review Is Needed\n\n`;
  summary += `Open services should be checked against operational intent and access-control requirements. A classification identifies review priority only.\n`;
  summary += `\n## Actions\n\n`;
  summary += `1. Confirm that every recorded service is required and authorized.\n`;
  summary += `2. Restrict administrative services to the users and network paths that require them.\n`;
  summary += `3. Collect evidence from the appropriate vantage before making reachability or incident conclusions.\n`;
  summary += `\n## Questions\n\n`;
  summary += `- Which recorded services are expected for this environment?\n`;
  summary += `- Does the observation include every intended source and the full declared scope?\n`;
  summary += `\n## Limits\n\n`;
  summary += `This observation describes what its collection point recorded. It does not establish reachability beyond that point, compromise, likelihood, cost, or overall security.`;
  return summary;
}

export interface ScorecardSummaryRequest {
  runUid: string;
  userProfile?: UserProfile;
}

export interface ScorecardSummaryResponse {
  success: boolean;
  summary?: string;
  provider?: string;
  isRuleBased?: boolean;
  code?: string;
  error?: string;
}
