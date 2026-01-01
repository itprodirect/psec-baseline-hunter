from __future__ import annotations
import _bootstrap  # noqa: F401

from pathlib import Path

import pandas as pd
import streamlit as st

from core.ingest import build_run_meta, detect_run_folders, extract_zip, save_upload


def guess_network_name(run_folder: Path) -> str:
    # Typical layout: <network-name>/rawscans/<run-folder>/
    try:
        if run_folder.parent.name == "rawscans":
            return run_folder.parent.parent.name
    except Exception:
        pass
    return ""


st.set_page_config(page_title="PSEC Baseline Hunter", layout="wide")

st.title("PSEC Baseline Hunter (v0)")
st.caption("Session 1: upload baselinekit zip → extract → detect runs → detect key files.")

st.markdown(
    """
**Session 1 goal**
- Upload a baselinekit `.zip`
- Extract into `data/extracted/...`
- Detect run folders (typically under `rawscans/`)
- Infer timestamp + run type from folder name
- Detect key files from baselinekit_v0 + smoketest outputs
- Detect network name (when folder structure allows)
"""
)

uploaded = st.file_uploader("Upload a baselinekit zip", type=["zip"])

colA, colB = st.columns([1, 2], vertical_alignment="top")

with colA:
    extract_clicked = st.button("Extract + Detect Runs", type="primary", disabled=(uploaded is None))

with colB:
    if uploaded is not None:
        st.write(f"**File:** `{uploaded.name}`")
        st.write(f"**Size:** ~{uploaded.size / (1024 * 1024):.2f} MB")

if extract_clicked and uploaded is not None:
    try:
        zip_path = save_upload(uploaded)
        extracted_root = extract_zip(zip_path)

        st.success(f"Saved: `{zip_path}`")
        st.success(f"Extracted to: `{extracted_root}`")

        run_folders = detect_run_folders(extracted_root)
        if not run_folders:
            st.warning("No run folders detected. Zip layout might be unusual.")
            st.stop()

        networks = sorted({guess_network_name(rf) for rf in run_folders if guess_network_name(rf)})
        if len(networks) == 1:
            st.info(f"Detected network: **{networks[0]}**")
        elif len(networks) > 1:
            st.info(f"Detected networks: **{', '.join(networks)}**")

        st.subheader(f"Detected runs: {len(run_folders)}")

        rows = []
        metas = []
        for rf in run_folders:
            meta = build_run_meta(rf)
            metas.append(meta)

            ts_str = meta.timestamp.strftime("%Y-%m-%d %H:%M") if meta.timestamp else ""
            key_counts = {k: len(v) for k, v in meta.key_files.items()}

            rows.append(
                {
                    "network": guess_network_name(meta.run_folder),
                    "run_folder": str(meta.run_folder),
                    "timestamp": ts_str,
                    "run_type": meta.run_type,
                    "discovery_files": key_counts.get("discovery", 0),
                    "hosts_up_files": key_counts.get("hosts_up", 0),
                    "ports_files": key_counts.get("ports", 0),
                    "http_titles_files": key_counts.get("http_titles", 0),
                    "infra_services_files": key_counts.get("infra_services", 0),
                    "gateway_smoke_files": key_counts.get("gateway_smoke", 0),
                    "snapshot_files": key_counts.get("snapshots", 0),
                }
            )

        df = pd.DataFrame(rows)
        st.dataframe(df, width='stretch', hide_index=True)

        st.divider()
        st.subheader("Per-run details")

        for meta in metas:
            ts_str = meta.timestamp.strftime("%Y-%m-%d %H:%M") if meta.timestamp else "(no timestamp parsed)"
            net = guess_network_name(meta.run_folder) or "(unknown network)"
            st.markdown(
                f"### `{meta.run_folder.name}`  \n"
                f"**Network:** {net}  \n"
                f"**Timestamp:** {ts_str}  \n"
                f"**Run type:** `{meta.run_type}`"
            )

            if not meta.key_files:
                st.write("No key files detected in this run folder.")
                continue

            for label, paths in meta.key_files.items():
                st.markdown(f"**{label}** ({len(paths)}):")
                for p in paths:
                    st.code(str(p), language="text")

    except Exception as e:
        st.error(f"Error: {e}")
        st.exception(e)
