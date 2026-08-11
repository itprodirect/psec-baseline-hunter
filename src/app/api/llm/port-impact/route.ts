import { NextResponse } from "next/server";

const EXTERNAL_EVIDENCE_REQUIRED = {
  success: false,
  code: "external_evidence_required",
  error:
    "Verified reachability evidence is required before a service-impact summary can be generated.",
} as const;

/**
 * This endpoint previously converted an internally observed port into claims
 * about public reachability and downstream impact. PSEC has no authoritative
 * server-side external-vantage evidence for this request, so it must fail
 * before request data can reach a prompt, fallback, or provider.
 */
export async function POST() {
  return NextResponse.json(EXTERNAL_EVIDENCE_REQUIRED, { status: 422 });
}
