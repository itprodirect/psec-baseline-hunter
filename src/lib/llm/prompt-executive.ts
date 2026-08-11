/** Evidence-bounded prompts for leadership-oriented Scorecard summaries. */

import type { ScorecardData } from "@/lib/types";
import {
  type UserProfile,
  PROFESSION_LABELS,
  CONTEXT_FACTOR_LABELS,
  REDACTED_PLACEHOLDER,
} from "@/lib/types/userProfile";
import { PORT_SERVICE_NAMES } from "@/lib/constants/risk-ports";

export function buildExecutiveSystemPrompt(profile: UserProfile): string {
  const profession = PROFESSION_LABELS[profile.profession];
  return `You are a cybersecurity advisor preparing a concise report for ${profession.label} leadership.

EVIDENCE RULES (mandatory):
1. State the supplied evidence status and limitations before findings.
2. Report services as observations from the stated collection point.
3. Never infer Internet exposure, external reachability, perimeter failure, compromise, incident likelihood, or monetary impact from an internal observation.
4. P0/P1 classifications set review priority only; they do not prove exploitation, vulnerability, or business impact.
5. A zero count is bounded to the recorded observation. Never describe the environment as safe, risk-free, stable, healthy, acceptable, or normal.
6. Do not invent facts, probabilities, cost estimates, regulatory outcomes, or positive reassurance.
7. Recommend verification and access-control decisions tied directly to observed facts.

OUTPUT FORMAT (markdown):
# Network Observation Brief
## Evidence Status
## Observed Findings
## Decisions Needed
## Recommended Next Steps
## Limits`;
}

export function buildExecutiveUserPrompt(data: ScorecardData, profile: UserProfile): string {
  const p0 = data.riskPortsDetail.filter((finding) => finding.risk === "P0");
  const p1 = data.riskPortsDetail.filter((finding) => finding.risk === "P1");
  const limitations = data.evidence.limitations.map((limitation) => `- ${limitation}`).join("\n");
  const context = profile.contextFactors
    .map((factor) => `- ${CONTEXT_FACTOR_LABELS[factor].label}`)
    .join("\n");
  const details = [...p0, ...p1]
    .slice(0, 10)
    .map((finding) => {
      const service = PORT_SERVICE_NAMES[finding.port] || finding.service || `Port ${finding.port}`;
      return `- ${finding.risk}: ${service}, recorded on ${finding.hostsAffected} device${finding.hostsAffected === 1 ? "" : "s"}`;
    })
    .join("\n");

  return `Prepare a bounded leadership report from this server-rebuilt Scorecard.

EVIDENCE CONTRACT:
- Version: ${data.evidence.version}
- Status: ${data.evidence.status}
- Reason codes: ${data.evidence.reasonCodes.join(", ") || "none"}
- Coverage status: ${data.evidence.coverage.current.status}
- Coverage score: ${data.evidence.coverage.current.score}
- Establishes reachability beyond the scan vantage: ${data.evidence.supports.externalReachability}
- External reachability is not established by this observation.

LIMITATIONS:
${limitations || "- No additional limitations were recorded."}

RECORDED OBSERVATION:
- Network: ${profile.includeNetworkDetails ? data.network : REDACTED_PLACEHOLDER}
- Observation time: ${data.timestamp}
- Devices recorded: ${data.totalHosts}
- Open services recorded: ${data.openPorts}
- P0-classified service observations requiring review: ${p0.length}
- P1-classified service observations requiring review: ${p1.length}

CLASSIFIED OBSERVATIONS:
${details || "- No P0/P1-classified services were recorded in this observation."}

ORGANIZATION CONTEXT (context only, not evidence of impact):
${context || "- General use"}

Use the required headings. Preserve every limitation and do not strengthen the conclusions.`;
}

export function generateRuleBasedExecutiveSummary(
  data: ScorecardData,
  profile: UserProfile
): string {
  void profile;
  const p0 = data.riskPortsDetail.filter((finding) => finding.risk === "P0").length;
  const p1 = data.riskPortsDetail.filter((finding) => finding.risk === "P1").length;
  let summary = `# Network Observation Brief\n\n## Evidence Status\n\n`;
  summary += `Status: **${data.evidence.status}** (${data.evidence.version}).\n\n`;
  summary += data.evidence.limitations.map((limitation) => `- ${limitation}`).join("\n");
  summary += `\n\n## Observed Findings\n\n`;

  if (!data.evidence.supports.llmSummary) {
    summary += `Insufficient evidence: the available observation does not support a generated leadership narrative. Collect a complete observation before drawing broader conclusions.\n`;
  } else {
    summary += `- ${data.totalHosts} device${data.totalHosts === 1 ? "" : "s"} and ${data.openPorts} open service${data.openPorts === 1 ? "" : "s"} were recorded.\n`;
    summary += `- ${p0} P0-classified and ${p1} P1-classified service observation${p0 + p1 === 1 ? "" : "s"} require operational review.\n`;
    if (p0 + p1 === 0) {
      summary += `- No P0/P1-classified services were recorded within this observation's declared scope, coverage, and collection point.\n`;
    }
  }

  summary += `\n## Decisions Needed\n\n`;
  summary += `- Confirm which recorded services are required for operations.\n`;
  summary += `- Assign an owner to verify access controls for classified service observations.\n`;
  summary += `\n## Recommended Next Steps\n\n`;
  summary += `1. Validate service intent and authorized access paths.\n`;
  summary += `2. Address unnecessary access and document approved exceptions.\n`;
  summary += `3. Obtain evidence from the appropriate vantage before making broader reachability or incident conclusions.\n`;
  summary += `\n## Limits\n\n`;
  summary += `This observation describes what its collection point recorded. It does not establish reachability beyond that point, compromise, likelihood, cost, or overall security.`;
  return summary;
}
