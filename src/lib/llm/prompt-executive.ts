/** Deterministic, evidence-bounded leadership summaries. */

import type { ScorecardData } from "@/lib/types";
import type { UserProfile } from "@/lib/types/userProfile";
import { renderProfileFormattingNote } from "@/lib/llm/profile-format";

export function generateRuleBasedExecutiveSummary(
  data: ScorecardData,
  profile: UserProfile
): string {
  const p0 = data.riskPortsDetail.filter((finding) => finding.risk === "P0").length;
  const p1 = data.riskPortsDetail.filter((finding) => finding.risk === "P1").length;
  let summary = `# Network Observation Brief\n\n## Evidence Status\n\n`;
  summary += `Status: **${data.evidence.status}** (${data.evidence.version}).\n\n`;
  summary += `${renderProfileFormattingNote(profile)}\n\n`;
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
