import _bootstrap  # noqa: F401

from pathlib import Path
import streamlit as st

from core.ingest import build_run_meta, detect_run_folders, extract_zip, save_upload
from core.nmap_parse import parse_ports, top_ports

st.set_page_config(page_title="Scorecard", layout="wide")
st.title("Scorecard (Session 2)")
st.caption("Upload → detect runs → parse Nmap XML → summarize open ports & gateway services.")

uploaded = st.file_uploader("Upload a baselinekit zip", type=["zip"])

if uploaded and st.button("Extract + Build Scorecard", type="primary"):
    zip_path = save_upload(uploaded)
    extracted_root = extract_zip(zip_path)
    st.success(f"Extracted to: `{extracted_root}`")

    run_folders = detect_run_folders(extracted_root)
    if not run_folders:
        st.error("No runs detected.")
        st.stop()

    metas = [build_run_meta(rf) for rf in run_folders]
    baseline = next((m for m in metas if m.run_type == "baselinekit_v0"), metas[0])

    st.subheader(f"Selected run: `{baseline.run_folder.name}`")

    # --- ports_top200_open.xml ---
    ports_files = baseline.key_files.get("ports", [])
    ports_xml = next((p for p in ports_files if str(p).endswith(".xml")), None)

    if ports_xml:
        df_ports = parse_ports(Path(ports_xml))
        df_open = df_ports[df_ports["state"] == "open"]

        st.metric("Open ports (rows)", int(len(df_open)))
        st.metric("Hosts w/ open ports", int(df_open["ip"].nunique()) if not df_open.empty else 0)

        st.markdown("### Top open ports (hosts affected)")
        st.dataframe(top_ports(df_ports, n=25), width="stretch", hide_index=True)

        st.markdown("### Open ports (detail)")
        st.dataframe(df_open, width="stretch", hide_index=True)
    else:
        st.warning("No ports XML found in this run.")

    # --- infra_services_gw.xml ---
    infra_files = baseline.key_files.get("infra_services", [])
    infra_xml = next((p for p in infra_files if str(p).endswith(".xml")), None)

    if infra_xml:
        df_infra = parse_ports(Path(infra_xml))
        st.markdown("### Gateway services (open ports)")
        st.dataframe(top_ports(df_infra, n=50), width="stretch", hide_index=True)
    else:
        st.warning("No infra_services_gw XML found in this run.")
