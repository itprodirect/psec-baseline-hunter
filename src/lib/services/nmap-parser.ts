/**
 * Nmap XML parser
 * Ported from core/nmap_parse.py
 */

import * as fs from "fs";
import * as path from "path";
import { XMLParser } from "fast-xml-parser";
import { PortFinding, TopPort } from "@/lib/types";

/**
 * Parse Nmap XML file to extract port findings
 * Equivalent to Python parse_ports() function
 */
export function parsePorts(xmlPath: string): PortFinding[] {
  const xmlContent = fs.readFileSync(xmlPath, "utf-8");
  const sourceXml = path.basename(xmlPath);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => {
      // These elements can appear multiple times
      return ["host", "address", "hostname", "port"].includes(name);
    },
  });

  const result = parser.parse(xmlContent);
  const findings: PortFinding[] = [];

  // Navigate to hosts
  const nmaprun = result.nmaprun;
  if (!nmaprun) {
    return findings;
  }

  const hosts = nmaprun.host || [];
  const hostArray = Array.isArray(hosts) ? hosts : [hosts];

  for (const host of hostArray) {
    // Check host status
    const status = host.status;
    if (status && status["@_state"] !== "up") {
      continue;
    }

    // Get IP address
    let ip = "";
    const addresses = host.address || [];
    const addressArray = Array.isArray(addresses) ? addresses : [addresses];
    for (const addr of addressArray) {
      if (addr["@_addrtype"] === "ipv4") {
        ip = addr["@_addr"] || "";
        break;
      }
    }

    // Get hostname
    let hostname = "";
    const hostnames = host.hostnames;
    if (hostnames) {
      const hostnameList = hostnames.hostname || [];
      const hostnameArray = Array.isArray(hostnameList) ? hostnameList : [hostnameList];
      if (hostnameArray.length > 0) {
        hostname = hostnameArray[0]["@_name"] || "";
      }
    }

    // Get ports
    const ports = host.ports;
    if (!ports) {
      continue;
    }

    const portList = ports.port || [];
    const portArray = Array.isArray(portList) ? portList : [portList];

    for (const port of portArray) {
      const protocol = port["@_protocol"] || "";
      const portidStr = port["@_portid"] || "";
      const portid = parseInt(portidStr, 10);

      // Get state
      const stateEl = port.state;
      const state = stateEl ? (stateEl["@_state"] || "") : "";

      // Get service info
      const svc = port.service;
      const service = svc ? (svc["@_name"] || "") : "";
      const product = svc ? (svc["@_product"] || "") : "";
      const version = svc ? (svc["@_version"] || "") : "";

      findings.push({
        ip,
        hostname,
        protocol,
        port: isNaN(portid) ? 0 : portid,
        state,
        service,
        product,
        version,
        sourceXml,
      });
    }
  }

  return findings;
}

/**
 * Aggregate ports to top N by host count
 * Equivalent to Python top_ports() function
 */
export function topPorts(portFindings: PortFinding[], n: number = 25): TopPort[] {
  if (portFindings.length === 0) {
    return [];
  }

  // Filter to open ports only
  const openPorts = portFindings.filter((p) => p.state === "open");
  if (openPorts.length === 0) {
    return [];
  }

  // Group by (protocol, port, service) and count unique IPs
  const groupedMap = new Map<string, { protocol: string; port: number; service: string; ips: Set<string> }>();

  for (const finding of openPorts) {
    const key = `${finding.protocol}:${finding.port}:${finding.service}`;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        protocol: finding.protocol,
        port: finding.port,
        service: finding.service,
        ips: new Set(),
      });
    }

    groupedMap.get(key)!.ips.add(finding.ip);
  }

  // Convert to TopPort array
  const topPortsList: TopPort[] = [];
  for (const group of groupedMap.values()) {
    topPortsList.push({
      protocol: group.protocol,
      port: group.port,
      service: group.service,
      hostsAffected: group.ips.size,
    });
  }

  // Sort by hostsAffected descending, then port ascending
  topPortsList.sort((a, b) => {
    if (b.hostsAffected !== a.hostsAffected) {
      return b.hostsAffected - a.hostsAffected;
    }
    return a.port - b.port;
  });

  // Return top N
  return topPortsList.slice(0, n);
}

/**
 * Parse multiple XML files and combine results
 */
export function parseMultipleXmls(xmlPaths: string[]): { ports: PortFinding[]; topPorts: TopPort[] } {
  const allPorts: PortFinding[] = [];

  for (const xmlPath of xmlPaths) {
    try {
      const ports = parsePorts(xmlPath);
      allPorts.push(...ports);
    } catch (error) {
      console.error(`Error parsing ${xmlPath}:`, error);
    }
  }

  return {
    ports: allPorts,
    topPorts: topPorts(allPorts),
  };
}
