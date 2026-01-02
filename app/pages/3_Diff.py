import sys
from pathlib import Path

import streamlit as st

# Add repo root (parent of /app) to Python path so we can import sibling modules like /core
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.diff import compare_runs, discover_runs, save_markdown_pair  # noqa: E402


st.set_page_config(page_title="Diff Mode", layout="wide")

st.title("Diff Mode — Baseline Comparison")
st.caption("Pick Network → Run type → Comparison → Compare → Review deltas → Export CHANGES.md + WATCHLIST.md")


@st.cache_data(show_spinner=False)
def _cached_runs():
    return discover_runs()


def _label_run(r) -> str:
    ts = r.timestamp_str or "(no ts)"
    rt = r.run_type or "(unknown type)"
    return f"{ts} | {rt} | {r.run_name}"


def _sort_newest_first(net_runs):
    # run_name is typically "YYYY-MM-DD_HHMM_<run_type>" so reverse string sort works well
    return sorted(net_runs, key=lambda r: r.run_name, reverse=True)


runs = _cached_runs()
if not runs:
    st.warning(
        "No runs found yet. Upload/extract a baselinekit zip in the Ingest page first.")
    st.stop()

# -----------------------------
# Selection UI
# -----------------------------
networks = sorted({r.network for r in runs})
c1, c2, c3 = st.columns([1, 1, 2])

with c1:
    network = st.selectbox("Network", networks, index=0)

net_runs = [r for r in runs if r.network == network]
if not net_runs:
    st.warning("No runs found for this network yet.")
    st.stop()

# Run type selector (prevents smoketest vs baselinekit comparisons)
run_types = sorted({r.run_type for r in net_runs if r.run_type})
if not run_types:
    st.warning("No run types found for this network yet.")
    st.stop()

with c2:
    run_type = st.selectbox("Run type", run_types, index=0)

net_runs = [r for r in net_runs if r.run_type == run_type]
net_runs = _sort_newest_first(net_runs)

if len(net_runs) < 2:
    st.warning(
        "Need at least two runs of the same run type to compare. Ingest another run.")
    st.stop()

# Build auto-paired comparisons: newest vs previous, etc.
pairs = []
for i in range(len(net_runs) - 1):
    newer = net_runs[i]
    older = net_runs[i + 1]
    pairs.append((older, newer))  # (A=older, B=newer)

preset_labels = ["Latest vs Previous"] + [
    f"{_label_run(b)}  ⟵vs⟶  {_label_run(a)}" for (a, b) in pairs
]

with c3:
    preset = st.selectbox("Comparison", preset_labels, index=0)

if preset == "Latest vs Previous":
    run_a, run_b = pairs[0]
else:
    idx = preset_labels.index(preset) - 1
    run_a, run_b = pairs[idx]

# Optional advanced manual override
with st.expander("Advanced: manual override Run A / Run B"):
    labels = [_label_run(r) for r in net_runs]

    # Choose sensible defaults: A=previous, B=latest
    a_default = 1 if len(labels) > 1 else 0
    b_default = 0

    a_sel = st.selectbox("Run A (baseline / older)", labels,
                         index=a_default, key="manual_run_a")
    b_sel = st.selectbox("Run B (new / compare)", labels,
                         index=b_default, key="manual_run_b")

    ra = net_runs[labels.index(a_sel)]
    rb = net_runs[labels.index(b_sel)]

    if ra.run_folder != rb.run_folder:
        run_a, run_b = ra, rb
    else:
        st.info(
            "Pick two different runs to override. (Otherwise preset selection is used.)")

# Clear, always-visible pairing summary
st.caption(
    f"Comparing: **A (older)** = `{run_a.run_id}`  →  **B (newer)** = `{run_b.run_id}`")

compare_clicked = st.button("Compare", type="primary")

if compare_clicked:
    with st.spinner("Computing diff..."):
        diff = compare_runs(run_a, run_b)
        st.session_state["last_diff"] = diff

diff = st.session_state.get("last_diff")
if not diff:
    st.info("Click **Compare** to generate deltas.")
    st.stop()

# -----------------------------
# Summary metrics
# -----------------------------
m1, m2, m3, m4, m5 = st.columns(5)
m1.metric("New hosts", len(diff.new_hosts))
m2.metric("Removed hosts", len(diff.removed_hosts))
m3.metric("Ports opened", len(diff.ports_opened))
m4.metric("Ports closed", len(diff.ports_closed))
m5.metric("New risky exposures", len(diff.risky_opened))

tabs = st.tabs(["Summary", "Hosts", "Ports", "Risk Flags", "Export"])

# -----------------------------
# Tabs
# -----------------------------
with tabs[0]:
    st.subheader("What changed")
    st.write(f"**Run A:** `{diff.run_a.run_id}`")
    st.write(f"**Run B:** `{diff.run_b.run_id}`")
    st.write("")

    st.markdown("### New risky exposures (quick view)")
    if diff.risky_opened.empty:
        st.success("No new risky exposures detected by current rules.")
    else:
        st.dataframe(diff.risky_opened,
                     use_container_width=True, hide_index=True)

with tabs[1]:
    colL, colR = st.columns(2)
    with colL:
        st.markdown("### New hosts")
        if diff.new_hosts:
            st.code("\n".join(diff.new_hosts))
        else:
            st.write("(none)")

    with colR:
        st.markdown("### Removed hosts")
        if diff.removed_hosts:
            st.code("\n".join(diff.removed_hosts))
        else:
            st.write("(none)")

with tabs[2]:
    colL, colR = st.columns(2)
    with colL:
        st.markdown("### Ports opened (new exposures)")
        if diff.ports_opened.empty:
            st.write("(none)")
        else:
            st.dataframe(diff.ports_opened,
                         use_container_width=True, hide_index=True)

    with colR:
        st.markdown("### Ports closed")
        if diff.ports_closed.empty:
            st.write("(none)")
        else:
            st.dataframe(diff.ports_closed,
                         use_container_width=True, hide_index=True)

with tabs[3]:
    st.subheader("Risk flags (new exposures only)")
    st.caption(
        "Rules are intentionally simple: flag ‘oh hell no’ ports + common admin/dev exposures.")

    if diff.risky_opened.empty:
        st.success("No risky deltas detected.")
    else:
        p0 = diff.risky_opened[diff.risky_opened["priority"] == "P0"]
        p1 = diff.risky_opened[diff.risky_opened["priority"] == "P1"]
        p2 = diff.risky_opened[diff.risky_opened["priority"] == "P2"]

        a, b, c = st.columns(3)
        a.metric("P0", len(p0))
        b.metric("P1", len(p1))
        c.metric("P2", len(p2))

        st.dataframe(diff.risky_opened,
                     use_container_width=True, hide_index=True)

with tabs[4]:
    st.subheader("Export")

    colA, colB = st.columns(2)

    with colA:
        st.markdown("### CHANGES.md")
        st.download_button(
            "Download CHANGES.md",
            data=diff.changes_md,
            file_name=f"{diff.run_a.network}__CHANGES__{diff.run_a.run_id}__VS__{diff.run_b.run_id}.md",
            mime="text/markdown",
        )
        st.text_area("Preview (CHANGES.md)", diff.changes_md, height=350)

    with colB:
        st.markdown("### WATCHLIST.md")
        st.download_button(
            "Download WATCHLIST.md",
            data=diff.watchlist_md,
            file_name=f"{diff.run_a.network}__WATCHLIST__{diff.run_a.run_id}__VS__{diff.run_b.run_id}.md",
            mime="text/markdown",
        )
        st.text_area("Preview (WATCHLIST.md)", diff.watchlist_md, height=350)

    st.markdown("### (Optional) Save to disk")
    if st.button("Write CHANGES.md + WATCHLIST.md to data/comparisons/"):
        out_dir = ROOT / "data" / "comparisons" / diff.run_a.network / \
            f"{diff.run_a.run_id}__VS__{diff.run_b.run_id}"
        p_changes, p_watch = save_markdown_pair(diff, out_dir)
        st.success(f"Wrote:\n- {p_changes}\n- {p_watch}")
