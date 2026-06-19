# Observation Bundle v1

Observation Bundle v1 is the metadata-only normalized contract for one
registered scan run. It is intentionally small: enough to compare repeated
observations later, without creating a collector platform or storing raw
artifacts.

## Schema Shape

Top-level fields:

| Field | Purpose |
| --- | --- |
| `schemaVersion` | Fixed value: `psec.observation-bundle.v1`. |
| `observationId` | Stable ID derived from the registered run UID. |
| `site` | Site/network reference: `siteId`, `networkName`, optional `networkScope`. |
| `collector` | The PSEC registered-run adapter that generated the bundle. |
| `batch` | Source run UID, start/end time, generated time, partial flag, notes. |
| `sources` | Provenance records for the manifest and parsed artifacts. |
| `vantage` | Collection vantage: active scan upload, run type, target when known. |
| `coverage` | Expected, present, and missing source categories plus a 0..1 score. |
| `devices` | Observed devices, identity evidence, and open-port observations. |
| `notes` | Bundle-level limitations. |

Device records include:

- `ips`, `macs`, `hostnames`, and `vendors` observed or reported by sources.
- `identityEvidence`, where every value points back to a `sourceId`.
- `openPorts` observed from Nmap XML, also linked to a `sourceId`.

## Sources and Coverage

The adapter reads existing registered scan runs. It currently uses:

- `ports` Nmap XML
- `discovery` Nmap XML
- `hosts_up.txt`
- ARP-like snapshot files whose basename starts with `arp`
- `scan_metadata.json` in the run folder, when present
- Additional Nmap XML from `http_titles`, `infra_services`, and `gateway_smoke`
  when those artifacts are already registered

Missing optional artifacts do not fail conversion. They reduce
`coverage.score`, set `coverage.status` to `partial` or `minimal`, and add
plain-language notes. Malformed optional artifacts are treated the same way.

## Trust Boundaries

Observation means the value was found directly in a parsed artifact. Examples:

- an IP address in Nmap XML
- a MAC address in Nmap XML or an ARP snapshot
- an open TCP port in Nmap XML

Reported means the source provided a label that may be useful but is not proof
of identity. Examples:

- hostnames from Nmap XML
- vendors from Nmap MAC address records
- live-host lines from `hosts_up.txt`

Inference is deliberately limited in v1. The adapter links evidence that points
to the same IP, MAC, or hostname into one device record, but it does not infer
ownership, device type, user intent, trust level, or whether a device is safe.

Unknown stays unknown. If scan target, collector host, MAC address, hostname, or
vendor data is not available, the field is `null` or an empty list and coverage
notes explain what was missing.

## Privacy Contract

Normalized bundles must not contain:

- raw packet payloads
- raw scan bodies
- absolute filesystem paths
- secrets or API keys
- real captures
- real inventories

Source records keep only artifact labels and basenames. Runtime validation
rebuilds imported bundles through a whitelist, caps bundle size and list counts,
drops unknown fields, and removes path-like or secret-like strings from
client-facing output.
