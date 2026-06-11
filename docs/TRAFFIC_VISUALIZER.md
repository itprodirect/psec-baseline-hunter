# Traffic Visualizer ("Packet Highway")

> V0 — see your network traffic as an animated city. Route: `/packet-highway`

Upload a saved packet capture and the app draws your network as a small city:
devices are **buildings**, your router is a **toll plaza**, the internet is the
**cloud skyline**, and traffic is **vehicles** driving between them. A
plain-English panel explains what happened, and deterministic watch rules flag
things worth reviewing — calmly, without scary language.

## What it accepts

| Input | Formats | Limit |
|-------|---------|-------|
| Packet capture | `.pcap`, `.pcapng` (Ethernet link type) | 50 MB |
| Device inventory (optional) | `.csv` — columns like `Device, MAC Address, Vendor, IP Address, Hostnames, Status, Notes, Security Recs` | 1 MB |
| Saved analysis | `.json` exported by the page ("Save analysis") | 10 MB |

A built-in sample ("Try the sample") uses fully synthetic data — TEST-NET IPs,
locally administered MACs, and `example.*` domains.

## Privacy model

- **Metadata only.** The parser reads timestamps, MAC/IP addresses, ports,
  protocols, packet/byte counts, and DNS/mDNS/LLMNR *query names*. Packet
  payload content is never extracted, stored, or displayed.
- **Nothing is written to disk.** The capture is analyzed in memory by
  `POST /api/packet-highway/analyze` and discarded; only the normalized
  metadata JSON is returned to the browser.
- **Sensitive details are hidden by default.** Full MACs, IPs, ports, and DNS
  names appear only after toggling "Show technical details". DNS names are
  grouped by domain by default.
- **API errors never expose filesystem paths** (uses the shared
  `getSafeErrorMessage` allow-listing pattern).
- `.gitignore` blocks `*.pcap`, `*.pcapng`, `*.cap`, `*.har`, `*.etl`, Zeek
  logs, raw flow JSON exports, and local inventories. Keep real captures in
  `local-samples/` (ignored) if you need them nearby.

## How to record a capture (Windows / Wireshark)

1. Install [Wireshark](https://www.wireshark.org/), capture on your **wired
   Ethernet** interface (V0 does not parse Wi-Fi monitor-mode or raw-IP
   captures).
2. Capture for a few minutes of normal use, then *File → Save As* → `.pcapng`.
3. Upload it on the Traffic Visualizer page. Add your device CSV to get
   unknown-device flagging.

Tip: a capture taken on one PC normally sees only that PC's traffic plus
broadcast chatter. To see the whole network, capture on a router/mirror port.

## Watch rules (deterministic, no LLM)

| Rule | Fires when |
|------|-----------|
| `unknown-device` | A device isn't in the uploaded inventory (only when a CSV was provided) |
| `admin-remote-ports` | SSH/RDP or admin ports (22, 8080, 8443, …) observed; escalates if external |
| `critical-ports` | Critical ports (23, 445, 3389, 5900, databases, …) observed; escalates if external |
| `high-outbound-volume` | A device sent > 50 MB to the internet in one capture |
| `many-dns-queries` | > 150 lookups from one device, or > 300 unique names |
| `many-external-endpoints` | A device talked to > 25 distinct internet endpoints |
| `unencrypted-http` | Plain HTTP flows observed |

Wording is intentionally conservative: "unusual" / "worth reviewing", never
"malware" — a capture alone is not strong enough evidence for verdicts.

## Architecture

```
src/lib/types/packet-highway.ts        # NormalizedCapture JSON model
src/lib/services/pcap-parser.ts        # dependency-free PCAP/PCAPNG metadata parser
src/lib/services/traffic-normalizer.ts # aggregates -> devices/flows/animation
src/lib/services/traffic-risk-rules.ts # watch rules (pure, client-safe)
src/lib/services/traffic-summary.ts    # plain-English summary (rule-based)
src/lib/services/capture-upload-safety.ts # limits + fixture validation
src/lib/constants/traffic-services.ts  # service categories + legend metadata
src/lib/demo/packet-highway-demo.ts    # synthetic demo through the real pipeline
src/app/api/packet-highway/analyze/    # in-memory analyze route
src/app/(dashboard)/packet-highway/    # page
src/components/packet-highway/         # scene, legend, panels, upload
tests/packet-highway-tests.js          # synthetic-capture test suite
```

## V0 limitations

- Ethernet captures only (no 802.11 monitor mode, Linux SLL, or raw IP).
- Parsing caps: 200k packets, 5k flows, 2k external IPs, 500 DNS names —
  larger captures are analyzed partially and marked `truncated`.
- Gateway detection is a heuristic (the MAC fronting the most external IPs).
- No DNS answer parsing yet, so external endpoints show as IPs, not site names.
- IPv6 is summarized (devices/flows tracked; no SLAAC/ND analysis).
