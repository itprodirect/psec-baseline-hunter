# Security policy

## Supported deployment boundary

PSEC Baseline Hunter is currently supported only for **local, single-user
dogfooding on a loopback interface**. It is not an authenticated service and
must not be treated as one.

| Deployment | Support status |
| --- | --- |
| One trusted user, local machine, loopback-only listener | Supported with the operating boundaries below |
| LAN-accessible service | Unsupported |
| Hosted or shared-link deployment | Unsupported |
| Multi-user or multi-tenant deployment | Unsupported |

Only the current repository state is reviewed. Older commits, forks, modified
builds, and undocumented deployment configurations are outside the supported
boundary.

## Local operating boundaries

For supported local use:

- bind the application explicitly to `127.0.0.1`;
- do not expose it through a tunnel, reverse proxy, port forward, shared host,
  or permissive firewall rule;
- use one trusted operating-system account and protect the local data folder;
- import only artifacts whose source and size you trust;
- treat scan data, observations, logs, and exports as sensitive network data;
- treat Scorecard and Diff output as decision support that requires operator
  verification, not proof that a network is safe or externally exposed;
- use the scanner only with a dedicated output location, conservative names,
  and cleanup disabled until the scanner-hardening issue is complete;
- keep external LLM features disabled unless the operator accepts the named
  provider's data handling and cost boundary; and
- stop the service when it is not actively in use.

If these boundaries cannot be maintained, do not run the application.

## Unsupported legacy runtime

The legacy Streamlit/Python implementation is retained as migration reference
material. It is not a supported runtime, is not covered by the current local
deployment verdict, and must not be hosted or exposed. Its dependency set and
error/output behavior have not been brought to the current Next.js security
boundary.

## Hosted and shared use

Do not host or share the current application. Authentication, object ownership,
tenant isolation, safe sharing grants, privacy-safe API responses, distributed
resource and provider quotas, audit provenance, and deployment-edge controls
must be designed and verified before that boundary changes.

The current hardening plan is maintained in
[`docs/security/SECURITY_HARDENING_ROADMAP.md`](docs/security/SECURITY_HARDENING_ROADMAP.md).

## Reporting a vulnerability

Do not publish sensitive vulnerability details, private network data,
credentials, provider responses, or weaponized reproduction steps in a public
issue or pull request.

1. If the repository Security tab offers **Report a vulnerability**, use that
   private channel.
2. Otherwise, contact a repository maintainer through an established private
   channel.
3. If no private channel is available, open a minimal public issue requesting
   security contact. Include no exploit details or sensitive data; move the
   discussion to a private channel before sharing evidence.

A useful private report includes the affected commit or version, deployment
assumptions, impact, a minimal sanitized reproduction, and suggested
remediation. Reports are evaluated against the supported deployment boundary
above. No response or remediation SLA is currently promised.

Non-sensitive hardening suggestions may use a normal public issue with the
`security` label.
