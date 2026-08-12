/** Deterministic, evidence-bounded Diff summaries. */

import type { DiffData } from "@/lib/types";
import type { UserProfile } from "@/lib/types/userProfile";
import { renderProfileFormattingNote } from "@/lib/llm/profile-format";

/** Generate an evidence-bounded fallback without invoking a provider. */
export function generateRuleBasedDiffSummary(data: DiffData, profile: UserProfile): string {
  let summary = `## Evidence Status\n\n`;
  summary += `Status: **${data.evidence.status}** (${data.evidence.version}).\n\n`;
  summary += `${renderProfileFormattingNote(profile)}\n\n`;
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
