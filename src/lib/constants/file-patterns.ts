/**
 * Key file patterns for baselinekit output detection
 * Ported from core/ingest.py find_key_files()
 */

export const KEY_FILE_PATTERNS: Record<string, string[]> = {
  discovery: [
    "discovery_ping_sweep.xml",
    "discovery_ping_sweep.nmap",
    "discovery_ping_sweep.gnmap",
    "discovery_smoke.xml",
    "discovery_smoke.nmap",
    "discovery_smoke.gnmap",
  ],
  hosts_up: ["hosts_up.txt"],
  ports: [
    "ports_top200_open.xml",
    "ports_top200_open.nmap",
    "ports_top200_open.gnmap",
  ],
  http_titles: [
    "http_titles.xml",
    "http_titles.nmap",
    "http_titles.gnmap",
  ],
  infra_services: [
    "infra_services_gw.xml",
    "infra_services_gw.nmap",
    "infra_services_gw.gnmap",
    "infra_services.xml",
    "infra_services.nmap",
    "infra_services.gnmap",
  ],
  gateway_smoke: [
    "gw_ports_smoke.xml",
    "gw_ports_smoke.nmap",
    "gw_ports_smoke.gnmap",
  ],
  snapshots: ["arp*", "ipconfig*", "route*"],
};

/**
 * Regex pattern for run folder names
 * Format: YYYY-MM-DD_HHMM_<type>
 * Example: 2025-12-31_2044_baselinekit_v0
 * Groups: [1]=date, [2]=hm, [3]=rest
 */
export const RUN_FOLDER_REGEX = /^(\d{4}-\d{2}-\d{2})_(\d{4})_(.+)$/;

/**
 * Maximum upload file size (500MB)
 */
export const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;

/**
 * ZIP file magic bytes
 */
export const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04];
