from __future__ import annotations

from pathlib import Path
import xml.etree.ElementTree as ET
from typing import Dict, List

import pandas as pd


def parse_ports(xml_path: Path) -> pd.DataFrame:
    """
    One row per (host, port) from an Nmap XML.
    Columns: ip, hostname, protocol, port, state, service, product, version, source_xml
    """
    xml_path = Path(xml_path)
    root = ET.parse(xml_path).getroot()

    rows: List[Dict] = []

    for host in root.findall("host"):
        status = host.find("status")
        if status is not None and status.get("state") != "up":
            continue

        ip = ""
        for addr in host.findall("address"):
            if addr.get("addrtype") == "ipv4":
                ip = addr.get("addr", "")
                break

        hostname = ""
        hn = host.find("hostnames/hostname")
        if hn is not None:
            hostname = hn.get("name", "")

        for port in host.findall("ports/port"):
            protocol = port.get("protocol", "")
            portid = port.get("portid", "")

            state_el = port.find("state")
            state = state_el.get("state", "") if state_el is not None else ""

            svc = port.find("service")
            service = svc.get("name", "") if svc is not None else ""
            product = svc.get("product", "") if svc is not None else ""
            version = svc.get("version", "") if svc is not None else ""

            rows.append(
                {
                    "ip": ip,
                    "hostname": hostname,
                    "protocol": protocol,
                    "port": int(portid) if str(portid).isdigit() else portid,
                    "state": state,
                    "service": service,
                    "product": product,
                    "version": version,
                    "source_xml": xml_path.name,
                }
            )

    return pd.DataFrame(rows)


def top_ports(df_ports: pd.DataFrame, n: int = 25) -> pd.DataFrame:
    """
    Summary: (protocol, port, service) -> number of unique hosts affected (open only)
    """
    if df_ports.empty:
        return df_ports

    df_open = df_ports[df_ports["state"] == "open"].copy()
    if df_open.empty:
        return df_open

    return (
        df_open.groupby(["protocol", "port", "service"], dropna=False)["ip"]
        .nunique()
        .reset_index(name="hosts_affected")
        .sort_values(["hosts_affected", "port"], ascending=[False, True])
        .head(n)
    )
