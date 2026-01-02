from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

import pandas as pd

from core.ingest import build_run_meta, detect_run_folders, project_root
from core.nmap_parse import parse_ports


# ----------------------------
# Models
# ----------------------------

PortKey = Tuple[str, str, int]  # (ip, protocol, port)


@dataclass(frozen=True)
class RunInfo:
    network: str
    extracted_root: Path
    run_folder: Path
    run_name: str          # run_folder.name
    run_type: str          # from folder name
    timestamp_str: str     # "YYYY-MM-DD HH:MM" or ""
    run_id: str            # network + timestamp + run_type (best effort)


@dataclass
class DiffResult:
    run_a: RunInfo
    run_b: RunInfo

    new_hosts: List[str]
    removed_hosts: List[str]

    ports_opened: pd.DataFrame   # rows from B (open-only)
    ports_closed: pd.DataFrame   # rows from A (open-only)

    risky_opened: pd.DataFrame   # subset of ports_opened w/ severity + reason

    changes_md: str
    watchlist_md: str


# ----------------------------
# Discovery helpers
# ----------------------------

def _is_hex8(s: str) -> bool:
    if len(s) != 8:
        return False
    try:
        int(s, 16)
        return True
    except ValueError:
        return False


def guess_network_from_extracted_root(extracted_root: Path) -> str:
    """
    extracted_root name is typically: <zip_stem>_<random8>
    where zip_stem often starts with network name like:
      batman_2025-12-31_2134_<...>
      orange_2025-12-31_1948_<...>
    """
    name = extracted_root.name
    parts = name.split("_")
    if parts and _is_hex8(parts[-1]):
        parts = parts[:-1]  # strip random suffix

    if not parts:
        return "unknown"

    # Heuristic: if token[1] looks like YYYY-MM-DD, token[0] is network
    if len(parts) >= 2 and len(parts[1]) == 10 and parts[1][4] == "-" and parts[1][7] == "-":
        return parts[0].lower()

    return parts[0].lower()


def discover_runs(data_extracted_dir: Optional[Path] = None) -> List[RunInfo]:
    """
    Scan data/extracted/* for baselinekit run folders (rawscans/*).
    """
    root = project_root()
    extracted_dir = data_extracted_dir or (root / "data" / "extracted")
    if not extracted_dir.exists():
        return []

    runs: List[RunInfo] = []
    for extracted_root in sorted(extracted_dir.glob("*")):
        if not extracted_root.is_dir():
            continue

        network = guess_network_from_extracted_root(extracted_root)

        run_folders = detect_run_folders(extracted_root)
        for rf in run_folders:
            meta = build_run_meta(rf)

            ts_str = meta.timestamp.strftime("%Y-%m-%d %H:%M") if meta.timestamp else ""
            # run_id: network + timestamp + run_type (best effort)
            if meta.timestamp and meta.run_type:
                run_id = f"{network}_{meta.timestamp.strftime('%Y-%m-%d_%H%M')}_{meta.run_type}"
            elif meta.timestamp:
                run_id = f"{network}_{meta.timestamp.strftime('%Y-%m-%d_%H%M')}"
            else:
                run_id = f"{network}_{rf.name}"

            runs.append(
                RunInfo(
                    network=network,
                    extracted_root=extracted_root,
                    run_folder=rf,
                    run_name=rf.name,
                    run_type=meta.run_type or "",
                    timestamp_str=ts_str,
                    run_id=run_id,
                )
            )

    # newest-ish first (timestamp_str sorts poorly; rely on folder name parse ordering from detect_run_folders)
    # but still group by network and then by run_name descending as a fallback.
    runs.sort(key=lambda r: (r.network, r.run_name), reverse=True)
    return runs


# ----------------------------
# Loading per-run artifacts
# ----------------------------

def _read_hosts_up(path: Path) -> List[str]:
    hosts: List[str] = []
    for line in path.read_text(errors="ignore").splitlines():
        s = line.strip()
        if not s:
            continue
        # basic IP-ish filter
        if all(ch.isdigit() or ch == "." for ch in s) and s.count(".") == 3:
            hosts.append(s)
    return hosts


def load_hosts(run: RunInfo) -> Set[str]:
    """
    Prefer hosts_up.txt if present; else derive from ports scan (open-only).
    """
    meta = build_run_meta(run.run_folder)
    candidates = meta.key_files.get("hosts_up", [])

    for p in candidates:
        if p.exists():
            return set(_read_hosts_up(p))

    # fallback: derive from open ports scan
    df_open = load_open_ports_df(run)
    if df_open.empty:
        return set()
    return set(df_open["ip"].dropna().astype(str).unique().tolist())


def _pick_ports_xml(run_folder: Path) -> Optional[Path]:
    """
    Prefer baselinekit-known file name if present; otherwise any .xml.
    """
    meta = build_run_meta(run_folder)
    ports_files = meta.key_files.get("ports", [])

    # Prefer .xml among matched key files
    xmls = [p for p in ports_files if p.suffix.lower() == ".xml" and p.exists()]
    if xmls:
        return xmls[0]

    # Else: any xml in folder
    any_xml = sorted(run_folder.glob("*.xml"))
    return any_xml[0] if any_xml else None


def load_open_ports_df(run: RunInfo) -> pd.DataFrame:
    """
    Returns open-only ports dataframe for a run.
    Columns come from core.nmap_parse.parse_ports:
      ip, hostname, protocol, port, state, service, product, version, source_xml
    """
    xml_path = _pick_ports_xml(run.run_folder)
    if not xml_path:
        return pd.DataFrame()

    df = parse_ports(xml_path)
    if df.empty:
        return df

    df_open = df[df["state"] == "open"].copy()
    # normalize types
    df_open["ip"] = df_open["ip"].astype(str)
    df_open["protocol"] = df_open["protocol"].astype(str)
    df_open["port"] = pd.to_numeric(df_open["port"], errors="coerce").fillna(-1).astype(int)
    return df_open


def _to_port_keys(df_open: pd.DataFrame) -> Set[PortKey]:
    if df_open.empty:
        return set()
    return set(zip(df_open["ip"], df_open["protocol"], df_open["port"]))


def _filter_df_by_keys(df: pd.DataFrame, keys: Set[PortKey]) -> pd.DataFrame:
    if df.empty or not keys:
        return df.iloc[0:0].copy()

    k_series = list(zip(df["ip"], df["protocol"], df["port"]))
    mask = pd.Series(k_series).isin(keys).values
    return df.loc[mask].copy()


# ----------------------------
# Risk flagging
# ----------------------------

RISK_PORTS: Dict[str, Set[int]] = {
    # "oh hell no"
    "P0": {23, 445, 3389, 5900, 135, 139, 1080},
    # common admin/dev exposures
    "P1": {8080, 8443, 8888},
    # context-dependent but worth watching if NEW
    "P2": {22, 80, 443},
}

PORT_NOTES: Dict[int, str] = {
    23: "Telnet (cleartext remote shell)",
    445: "SMB (Windows file sharing)",
    3389: "RDP (remote desktop)",
    5900: "VNC (remote desktop)",
    135: "RPC endpoint mapper",
    139: "NetBIOS/SMB legacy",
    1080: "SOCKS proxy (possible pivot)",
    8080: "HTTP alt / admin panel common",
    8443: "HTTPS alt / admin panel common",
    8888: "Dev/admin service common (Jupyter/etc.)",
    22: "SSH (remote admin)",
    80: "HTTP (web UI/admin possible)",
    443: "HTTPS (web UI/admin possible)",
}


def risk_flags(df_opened: pd.DataFrame) -> pd.DataFrame:
    """
    Tag only NEWLY opened ports (delta) with P0/P1/P2 + reason.
    """
    if df_opened.empty:
        return pd.DataFrame(columns=["priority", "reason", "ip", "protocol", "port", "service", "product", "version"])

    out_rows = []
    for _, r in df_opened.iterrows():
        port = int(r["port"])
        priority = None
        for p, ports in RISK_PORTS.items():
            if port in ports:
                priority = p
                break
        if not priority:
            continue

        note = PORT_NOTES.get(port, "Flagged port")
        svc = str(r.get("service", "") or "").strip()
        prod = str(r.get("product", "") or "").strip()

        reason = note
        if svc:
            reason += f" | service={svc}"
        if prod:
            reason += f" | product={prod}"

        out_rows.append(
            {
                "priority": priority,
                "reason": reason,
                "ip": r["ip"],
                "protocol": r["protocol"],
                "port": port,
                "service": r.get("service", ""),
                "product": r.get("product", ""),
                "version": r.get("version", ""),
            }
        )

    df_risk = pd.DataFrame(out_rows)
    if df_risk.empty:
        return df_risk

    # Sort: P0 first, then P1, then P2
    order = {"P0": 0, "P1": 1, "P2": 2}
    df_risk["_ord"] = df_risk["priority"].map(order).fillna(9).astype(int)
    df_risk = df_risk.sort_values(["_ord", "ip", "port"]).drop(columns=["_ord"])
    return df_risk


# ----------------------------
# Diff + Markdown export
# ----------------------------

def compare_runs(run_a: RunInfo, run_b: RunInfo) -> DiffResult:
    """
    A = baseline (older), B = comparison (newer)
    """
    hosts_a = load_hosts(run_a)
    hosts_b = load_hosts(run_b)

    new_hosts = _sort_ips(list(hosts_b - hosts_a))
    removed_hosts = _sort_ips(list(hosts_a - hosts_b))

    df_a_open = load_open_ports_df(run_a)
    df_b_open = load_open_ports_df(run_b)

    a_keys = _to_port_keys(df_a_open)
    b_keys = _to_port_keys(df_b_open)

    opened = b_keys - a_keys
    closed = a_keys - b_keys

    df_opened = _filter_df_by_keys(df_b_open, opened)
    df_closed = _filter_df_by_keys(df_a_open, closed)

    df_risk = risk_flags(df_opened)

    changes_md = render_changes_md(run_a, run_b, new_hosts, removed_hosts, df_opened, df_closed, df_risk)
    watchlist_md = render_watchlist_md(run_a, run_b, df_risk)

    return DiffResult(
        run_a=run_a,
        run_b=run_b,
        new_hosts=new_hosts,
        removed_hosts=removed_hosts,
        ports_opened=df_opened,
        ports_closed=df_closed,
        risky_opened=df_risk,
        changes_md=changes_md,
        watchlist_md=watchlist_md,
    )


def render_changes_md(
    run_a: RunInfo,
    run_b: RunInfo,
    new_hosts: List[str],
    removed_hosts: List[str],
    ports_opened: pd.DataFrame,
    ports_closed: pd.DataFrame,
    risky_opened: pd.DataFrame,
) -> str:
    def _bullet(items: List[str]) -> str:
        return "\n".join([f"- {x}" for x in items]) if items else "- (none)"

    md = []
    md.append(f"# CHANGES — {run_a.network}")
    md.append("")
    md.append(f"**Run A (baseline):** `{run_a.run_id}`  \nPath: `{run_a.run_folder}`")
    md.append(f"**Run B (new):** `{run_b.run_id}`  \nPath: `{run_b.run_folder}`")
    md.append("")
    md.append("## Summary")
    md.append(f"- New hosts: **{len(new_hosts)}**")
    md.append(f"- Removed hosts: **{len(removed_hosts)}**")
    md.append(f"- Ports opened (new exposures): **{len(ports_opened)}**")
    md.append(f"- Ports closed: **{len(ports_closed)}**")
    md.append(f"- New risky exposures flagged: **{len(risky_opened)}**")
    md.append("")

    md.append("## New hosts")
    md.append(_bullet(new_hosts))
    md.append("")
    md.append("## Removed hosts")
    md.append(_bullet(removed_hosts))
    md.append("")

    md.append("## Ports opened")
    md.append(df_to_md_table(ports_opened, max_rows=200))
    md.append("")
    md.append("## Ports closed")
    md.append(df_to_md_table(ports_closed, max_rows=200))
    md.append("")
    md.append("## New risky exposures (P0/P1/P2)")
    md.append(df_to_md_table(risky_opened, max_rows=200))
    md.append("")

    return "\n".join(md).strip() + "\n"


def render_watchlist_md(run_a: RunInfo, run_b: RunInfo, risky_opened: pd.DataFrame) -> str:
    md = []
    md.append(f"# WATCHLIST — {run_a.network}")
    md.append("")
    md.append(f"Comparison: `{run_a.run_id}` → `{run_b.run_id}`")
    md.append("")

    if risky_opened.empty:
        md.append("No new risky exposures detected from the configured port rules.")
        md.append("")
        return "\n".join(md)

    md.append("## Prioritized items")
    for prio in ["P0", "P1", "P2"]:
        dfp = risky_opened[risky_opened["priority"] == prio]
        if dfp.empty:
            continue
        md.append(f"### {prio}")
        for _, r in dfp.iterrows():
            md.append(f"- **{r['ip']}** `{r['protocol']}/{r['port']}` — {r['reason']}")
        md.append("")

    md.append("## Suggested next actions (fast)")
    md.append("- Confirm if each exposure is expected (device owner / change ticket / known service).")
    md.append("- Identify device by IP → MAC (ARP table / router UI / DHCP leases).")
    md.append("- If not expected: block at router/firewall, disable service, or isolate VLAN.")
    md.append("- Re-scan the single host/port to confirm it’s truly open (avoid false positives).")
    md.append("")

    return "\n".join(md).strip() + "\n"


def df_to_md_table(df: pd.DataFrame, max_rows: int = 100) -> str:
    if df is None or df.empty:
        return "_(none)_"
    # Keep it readable in markdown
    slim = df.copy()
    if len(slim) > max_rows:
        slim = slim.head(max_rows)
    return slim.to_markdown(index=False)


def save_markdown_pair(diff: DiffResult, out_dir: Path) -> Tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    p_changes = out_dir / "CHANGES.md"
    p_watch = out_dir / "WATCHLIST.md"
    p_changes.write_text(diff.changes_md, encoding="utf-8")
    p_watch.write_text(diff.watchlist_md, encoding="utf-8")
    return p_changes, p_watch


def _sort_ips(ips: List[str]) -> List[str]:
    def key(ip: str):
        try:
            return tuple(int(x) for x in ip.split("."))
        except Exception:
            return (999, 999, 999, 999)
    return sorted(ips, key=key)
