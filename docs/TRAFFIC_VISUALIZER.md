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
| Saved analysis | `.json` exported by the page ("Save analysis"); treated as saved analysis data, not raw-capture proof | 10 MB |

A built-in sample ("Load guided sample") uses fully synthetic data —
TEST-NET IPs, locally administered MACs, and `example.*` domains.

## Privacy model

- **Metadata only.** The parser reads timestamps, MAC/IP addresses, ports,
  protocols, packet/byte counts, and DNS/mDNS/LLMNR *query names*. Packet
  payload content is not intentionally extracted, stored, or displayed.
- **No intentional raw-capture storage by this app.** The capture is analyzed
  in memory by `POST /api/packet-highway/analyze`; the app returns normalized
  metadata JSON and does not save the raw capture file. Browsers, frameworks,
  or hosting layers may still buffer uploads while the request is processed.
- **Sensitive details are hidden by default.** Full MACs, IPs, ports, and DNS
  names appear only after toggling "Show technical details". DNS names are
  grouped by domain by default.
- **Saved JSON is not evidence of a raw capture.** JSON imports are rebuilt
  through a whitelist and marked as `fixture`, but they can be edited outside
  the app and CSV inventory matching is not reapplied to them.
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

## 60-second walkthrough script

This walkthrough is meant to take about 60 seconds; the synthetic sample itself
represents several minutes of traffic.

1. Open `/packet-highway` and choose **Load guided sample**.
2. The page loads fully synthetic sample data and selects the not-in-list
   device.
3. Read the selected device panel: the device is missing from the sample device
   list, and its related watch items explain why it is worth reviewing.
4. Read **Watch items** for the two intended observations: a device not in the
   device list, and old-style unencrypted HTTP traffic.
5. Toggle **Show technical details** only if you need full MAC/IP/DNS details.

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
  larger captures are analyzed partially and marked `truncated`. Malformed or
  truncated tails after a valid prefix are also surfaced as partial.
- Gateway detection is a heuristic (the MAC fronting the most external IPs).
- No DNS answer parsing yet, so external endpoints show as IPs, not site names.
- IPv6 is summarized (devices/flows tracked; no SLAAC/ND analysis).

## Manual smoke checklist

- Load the guided sample; verify the synthetic source notice, metrics, scene,
  selected unknown-device panel, watch items, and export metadata notice appear.
- Confirm the sample shows no partial-analysis notice.
- Toggle **Show technical details** on and off; full identifiers should reveal
  only while enabled.
- Upload a saved JSON analysis; verify it is labeled as saved analysis JSON, not
  raw-capture evidence.
- Load or construct a synthetic saved JSON with `meta.truncated: true`; verify
  the partial notice says the view may be incomplete.
- Enable reduced-motion emulation; verify the static flow lines remain visible
  and the animation control changes to the reduced-motion notice.
- Upload an unsupported or malformed file; verify the error is friendly, stale
  prior analysis clears, and no filesystem path is shown.
