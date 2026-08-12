/** Deterministic, evidence-bounded Scorecard summaries. */

import type { ScorecardData } from "@/lib/types";
import type { UserProfile } from "@/lib/types/userProfile";
import { renderProfileFormattingNote } from "@/lib/llm/profile-format";

/** Generate an evidence-bounded fallback without invoking a provider. */
export function generateRuleBasedSummary(data: ScorecardData, profile: UserProfile): string {
  const p0Count = data.riskPortsDetail.filter((finding) => finding.risk === "P0").length;
  const p1Count = data.riskPortsDetail.filter((finding) => finding.risk === "P1").length;
  let summary = `## Evidence Status\n\n`;
  summary += `Status: **${data.evidence.status}** (${data.evidence.version}).\n\n`;
  summary += `${renderProfileFormattingNote(profile)}\n\n`;
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
