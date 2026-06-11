/**
 * Nmap XML parser
 * Ported from core/nmap_parse.py
 */

import * as fs from "fs";
import * as path from "path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PortFinding, TopPort } from "@/lib/types";

export class NmapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NmapParseError";
  }
}

export function isNmapParseError(error: unknown): error is NmapParseError {
  return (
    error instanceof NmapParseError ||
    (error instanceof Error && error.name === "NmapParseError")
  );
}

type XmlRecord = Record<string, unknown>;

function asRecord(value: unknown): XmlRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as XmlRecord)
    : null;
}

function asRecordArray(value: unknown): XmlRecord[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((item): item is XmlRecord => item !== null);
  const record = asRecord(value);
  return record ? [record] : [];
}

function attr(record: XmlRecord | null, name: string): string {
  const value = record?.[name];
  return typeof value === "string" ? value : "";
}

/**
 * Parse Nmap XML file to extract port findings
 * Equivalent to Python parse_ports() function
 */
export function parsePorts(xmlPath: string): PortFinding[] {
  const xmlContent = fs.readFileSync(xmlPath, "utf-8");
  const sourceXml = path.basename(xmlPath);

  const validation = XMLValidator.validate(xmlContent);
  if (validation !== true) {
    throw new NmapParseError("XML file is not valid Nmap XML.");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    isArray: (name) => {
      // These elements can appear multiple times
      return ["host", "address", "hostname", "port"].includes(name);
    },
  });

  let result: unknown;
  try {
    result = parser.parse(xmlContent);
  } catch {
    throw new NmapParseError("XML file could not be parsed as Nmap XML.");
  }
  const findings: PortFinding[] = [];

  // Navigate to hosts
  const root = asRecord(result);
  const nmaprun = asRecord(root?.nmaprun);
  if (!nmaprun) {
    return findings;
  }

  const hostArray = asRecordArray(nmaprun.host);

  for (const host of hostArray) {
    // Check host status
    const status = asRecord(host.status);
    if (status && attr(status, "@_state") !== "up") {
      continue;
    }

    // Get IP address
    let ip = "";
    const addressArray = asRecordArray(host.address);
    for (const addr of addressArray) {
      if (attr(addr, "@_addrtype") === "ipv4") {
        ip = attr(addr, "@_addr");
        break;
      }
    }

    // Get hostname
    let hostname = "";
    const hostnames = asRecord(host.hostnames);
    if (hostnames) {
      const hostnameArray = asRecordArray(hostnames.hostname);
      if (hostnameArray.length > 0) {
        hostname = attr(hostnameArray[0], "@_name");
      }
    }

    // Get ports
    const ports = asRecord(host.ports);
    if (!ports) {
      continue;
    }

    const portArray = asRecordArray(ports.port);

    for (const port of portArray) {
      const protocol = attr(port, "@_protocol");
      const portidStr = attr(port, "@_portid");
      const portid = parseInt(portidStr, 10);

      // Get state
      const state = attr(asRecord(port.state), "@_state");

      // Get service info
      const svc = asRecord(port.service);
      const service = attr(svc, "@_name");
      const product = attr(svc, "@_product");
      const version = attr(svc, "@_version");

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
