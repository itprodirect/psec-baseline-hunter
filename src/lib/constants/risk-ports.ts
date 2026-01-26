/**
 * Risk port classification for security baseline analysis
 * P0 = Critical (immediate action), P1 = High (review soon), P2 = Context-dependent
 */

import { RiskLevel } from "@/lib/types";

/**
 * P0 - Critical risk ports
 * These should never be exposed externally
 */
export const P0_PORTS: number[] = [
  23,    // Telnet - unencrypted remote access
  445,   // SMB/CIFS - file sharing, ransomware vector
  3389,  // RDP - remote desktop, common attack vector
  5900,  // VNC - remote desktop
  135,   // MSRPC - Windows RPC
  139,   // NetBIOS Session Service
  1080,  // SOCKS proxy
  5985,  // WinRM HTTP
  5986,  // WinRM HTTPS
  1433,  // MSSQL
  1434,  // MSSQL Browser
  3306,  // MySQL (when exposed externally)
  5432,  // PostgreSQL (when exposed externally)
  6379,  // Redis
  27017, // MongoDB
  9200,  // Elasticsearch
];

/**
 * P1 - High risk ports (Admin/Dev interfaces)
 * Should be reviewed and restricted
 */
export const P1_PORTS: number[] = [
  8080,  // HTTP alternate / admin panels
  8443,  // HTTPS alternate / admin panels
  8888,  // Alternative HTTP / Jupyter
  9000,  // Various admin interfaces
  9090,  // Prometheus / admin
  10000, // Webmin
  2375,  // Docker API (unencrypted)
  2376,  // Docker API (TLS)
  4444,  // Metasploit default
  7001,  // WebLogic
  8000,  // Various dev servers
  8081,  // HTTP alternate
  8082,  // HTTP alternate
];

/**
 * P2 - Context-dependent ports
 * Standard services that may or may not be issues
 */
export const P2_PORTS: number[] = [
  22,    // SSH - usually OK but should be monitored
  80,    // HTTP - depends on what's served
  443,   // HTTPS - depends on what's served
  21,    // FTP - insecure but sometimes needed
  25,    // SMTP
  53,    // DNS
  110,   // POP3
  143,   // IMAP
  993,   // IMAPS
  995,   // POP3S
];

/**
 * Get risk level for a port
 */
export function getPortRisk(port: number): RiskLevel | null {
  if (P0_PORTS.includes(port)) return "P0";
  if (P1_PORTS.includes(port)) return "P1";
  if (P2_PORTS.includes(port)) return "P2";
  return null;
}

/**
 * Risk level descriptions for UI
 */
export const RISK_DESCRIPTIONS: Record<RiskLevel, string> = {
  P0: "Critical - Immediate action required",
  P1: "High - Should be reviewed and restricted",
  P2: "Context-dependent - Monitor and assess",
};

/**
 * Action recommendations for P0 ports
 */
export const P0_ACTIONS: Record<number, string> = {
  23: "Disable Telnet and use SSH instead",
  445: "Block at perimeter or isolate to internal VLAN only",
  3389: "Block RDP at perimeter, use VPN or bastion for remote access",
  5900: "Block VNC at perimeter, use secure alternatives",
  135: "Block MSRPC at perimeter firewall",
  139: "Block NetBIOS at perimeter firewall",
  1080: "Disable SOCKS proxy or restrict to internal use",
  5985: "Block WinRM at perimeter, use internal management only",
  5986: "Block WinRM at perimeter, use internal management only",
  1433: "Block MSSQL externally, use internal connections only",
  1434: "Block MSSQL Browser externally",
  3306: "Block MySQL externally, use internal connections only",
  5432: "Block PostgreSQL externally, use internal connections only",
  6379: "Block Redis externally, enable authentication",
  27017: "Block MongoDB externally, enable authentication",
  9200: "Block Elasticsearch externally, enable authentication",
};

/**
 * Service names for known ports
 */
export const PORT_SERVICE_NAMES: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  135: "MSRPC",
  139: "NetBIOS",
  143: "IMAP",
  443: "HTTPS",
  445: "SMB",
  993: "IMAPS",
  995: "POP3S",
  1080: "SOCKS",
  1433: "MSSQL",
  1434: "MSSQL Browser",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5900: "VNC",
  5985: "WinRM HTTP",
  5986: "WinRM HTTPS",
  6379: "Redis",
  8080: "HTTP Proxy",
  8443: "HTTPS Alt",
  8888: "HTTP Alt",
  9200: "Elasticsearch",
  27017: "MongoDB",
};
