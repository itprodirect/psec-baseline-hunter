/** Evidence-bounded helpers for conditional service-review guidance. */

import type { PortImpactData } from "@/lib/types";
import type { UserProfile } from "@/lib/types/userProfile";
import { PORT_SERVICE_NAMES } from "@/lib/constants/risk-ports";

/**
 * Retained for direct helper compatibility. The public route rejects these
 * requests because PSEC has no server-authoritative external-vantage evidence.
 */
export function buildPortImpactSystemPrompt(): string {
  return `You are preparing conditional review guidance for a network service observed by an internal scan.

The observation does NOT establish Internet exposure, external reachability, perimeter failure, exploitation, compromise, incident probability, or financial impact.

Respond only with valid JSON matching this structure:
{
  "severity": "Critical" or "High",
  "attackScenario": "A bounded explanation of what to verify, phrased conditionally",
  "breachExamples": [],
  "financialImpact": {
    "avgBreachCost": "Not assessed from available evidence",
    "recoveryTime": "Not assessed from available evidence",
    "potentialFines": "Not assessed from available evidence"
  },
  "quickFix": "A verification and access-control action tied to the observed service"
}

Mandatory rules:
- Describe the service as observed at the collection point, never as publicly reachable.
- Do not claim a vulnerability, attack, breach, probability, cost, fine, or compliance outcome.
- Do not provide incident anecdotes as evidence about this environment.
- Recommend confirming operational need, authentication, patching, access controls, and the intended network path.
- Require separately verified reachability evidence before any claim beyond the scan vantage.
- Return no text before or after the JSON object.`;
}

export function buildPortImpactUserPrompt(
  port: number,
  protocol: string,
  service: string,
  userProfile?: UserProfile
): string {
  const serviceName = PORT_SERVICE_NAMES[port] || service || `Port ${port}`;
  const contextCount = userProfile?.contextFactors.length ?? 0;
  return `Prepare conditional service-review guidance.

RECORDED OBSERVATION:
- Service: ${serviceName}
- Port/protocol: ${port}/${protocol}
- Collection vantage: internal or otherwise unverified
- External reachability: not established
- Organization context factors supplied: ${contextCount} (context only; not impact evidence)

Explain what an operator should verify if this service was not expected. Preserve the evidence limitations and return only the required JSON.`;
}

/**
 * Direct rule-based fallback. It intentionally contains no incidents, impact
 * estimates, or assumptions about reachability beyond the scan vantage.
 */
export function generateRuleBasedImpact(
  port: number,
  protocol: string,
  service: string
): PortImpactData {
  const serviceName = PORT_SERVICE_NAMES[port] || service || `Port ${port}`;
  return {
    port,
    protocol,
    service: serviceName,
    severity: "High",
    attackScenario:
      `${serviceName} was observed at the scan collection point. Confirm that it is required, authenticated, patched, and limited to intended users and network paths; this observation alone does not establish reachability beyond that point or an incident.`,
    breachExamples: [],
    financialImpact: {
      avgBreachCost: "Not assessed from available evidence",
      recoveryTime: "Not assessed from available evidence",
      potentialFines: "Not assessed from available evidence",
    },
    quickFix:
      "Verify the service owner and operational need, review access controls, and collect evidence from the appropriate vantage before making broader reachability claims.",
  };
}
