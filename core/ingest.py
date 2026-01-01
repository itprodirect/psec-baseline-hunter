from __future__ import annotations

import re
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple


RUN_FOLDER_RE = re.compile(r"^(?P<date>\d{4}-\d{2}-\d{2})_(?P<hm>\d{4})_(?P<rest>.+)$")


@dataclass(frozen=True)
class RunMeta:
    run_folder: Path
    timestamp: Optional[datetime]
    run_type: str
    key_files: Dict[str, List[Path]]  # label -> list of paths


def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def project_root() -> Path:
    # Assumes: repo_root/core/ingest.py
    return Path(__file__).resolve().parents[1]


def save_upload(uploaded_file, uploads_dir: Optional[Path] = None) -> Path:
    """
    Save a Streamlit UploadedFile to disk.
    """
    root = project_root()
    uploads_dir = ensure_dir(uploads_dir or (root / "data" / "uploads"))

    suffix = Path(uploaded_file.name).suffix.lower()
    if suffix != ".zip":
        raise ValueError("Only .zip uploads are supported in Session 1.")

    upload_id = uuid.uuid4().hex[:10]
    out_path = uploads_dir / f"{Path(uploaded_file.name).stem}_{upload_id}.zip"
    out_path.write_bytes(uploaded_file.getbuffer())
    return out_path


def extract_zip(zip_path: Path, out_dir: Optional[Path] = None) -> Path:
    """
    Extract zip to: data/extracted/<zip_stem>_<id>/
    Returns the extracted root folder path.
    """
    root = project_root()
    out_dir = out_dir or (root / "data" / "extracted" / f"{zip_path.stem}_{uuid.uuid4().hex[:8]}")
    out_dir = ensure_dir(out_dir)

    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(out_dir)

    return out_dir


def _parse_run_folder_name(name: str) -> Tuple[Optional[datetime], str]:
    """
    Example: 2025-12-31_2044_baselinekit_v0 -> (datetime, "baselinekit_v0")
    """
    m = RUN_FOLDER_RE.match(name)
    if not m:
        return None, ""

    dt_str = f"{m.group('date')} {m.group('hm')}"
    try:
        ts = datetime.strptime(dt_str, "%Y-%m-%d %H%M")
    except ValueError:
        ts = None

    run_type = m.group("rest") or ""
    return ts, run_type


def detect_run_folders(extracted_root: Path) -> List[Path]:
    """
    Find run folders, primarily under any `rawscans/` directory.
    """
    extracted_root = Path(extracted_root)

    run_candidates: List[Path] = []
    for rawscans_dir in extracted_root.rglob("rawscans"):
        if rawscans_dir.is_dir():
            for child in rawscans_dir.iterdir():
                if child.is_dir():
                    ts, run_type = _parse_run_folder_name(child.name)
                    if ts or run_type:
                        run_candidates.append(child)

    if not run_candidates:
        for d in extracted_root.rglob("*"):
            if d.is_dir():
                ts, run_type = _parse_run_folder_name(d.name)
                if ts or run_type:
                    if any(d.glob("*.xml")) or any(d.glob("*.nmap")) or any(d.glob("*.gnmap")):
                        run_candidates.append(d)

    unique = list({p.resolve(): p for p in run_candidates}.values())

    def sort_key(p: Path):
        ts, _ = _parse_run_folder_name(p.name)
        return (ts is not None, ts or datetime.min)

    unique.sort(key=sort_key, reverse=True)
    return unique


def find_key_files(run_folder: Path) -> Dict[str, List[Path]]:
    """
    Detect presence of baselinekit_v0 + smoketest outputs (your real filenames).
    """
    run_folder = Path(run_folder)

    patterns = {
        "discovery": [
            "discovery_ping_sweep.xml", "discovery_ping_sweep.nmap", "discovery_ping_sweep.gnmap",
            "discovery_smoke.xml", "discovery_smoke.nmap", "discovery_smoke.gnmap",
        ],
        "hosts_up": ["hosts_up.txt"],
        "ports": [
            "ports_top200_open.xml", "ports_top200_open.nmap", "ports_top200_open.gnmap",
        ],
        "http_titles": [
            "http_titles.xml", "http_titles.nmap", "http_titles.gnmap",
        ],
        "infra_services": [
            "infra_services_gw.xml", "infra_services_gw.nmap", "infra_services_gw.gnmap",
            "infra_services.xml", "infra_services.nmap", "infra_services.gnmap",
        ],
        "gateway_smoke": [
            "gw_ports_smoke.xml", "gw_ports_smoke.nmap", "gw_ports_smoke.gnmap",
        ],
        "snapshots": ["arp*", "ipconfig*", "route*"],
    }

    found: Dict[str, List[Path]] = {}
    for label, globs in patterns.items():
        hits: List[Path] = []
        for g in globs:
            hits.extend(run_folder.glob(g))
        hits = [p for p in hits if p.is_file()]
        # de-dupe
        seen = set()
        deduped = []
        for p in hits:
            rp = p.resolve()
            if rp not in seen:
                seen.add(rp)
                deduped.append(p)
        if deduped:
            found[label] = deduped

    return found


def build_run_meta(run_folder: Path) -> RunMeta:
    ts, run_type = _parse_run_folder_name(Path(run_folder).name)
    key_files = find_key_files(run_folder)
    return RunMeta(run_folder=Path(run_folder), timestamp=ts, run_type=run_type or "", key_files=key_files)
