/**
 * Inventory Service - Parses and manages device inventory CSV files
 * Fault-tolerant parsing for blank rows, missing values, varied formats
 */

import * as fs from "fs";
import * as path from "path";
import { getDataDir, ensureDir } from "./ingest";
import { resolvePathWithin, sanitizeNetworkName } from "./path-safety";

/**
 * Inventory device record
 */
export interface InventoryDevice {
  id: string; // Generated unique ID
  device: string; // Friendly name
  mac: string;
  vendor: string;
  ip: string;
  hostnames: string;
  status: string;
  notes: string;
  securityRecs: string;
  // Metadata
  network: string;
  addedAt: string;
  updatedAt: string;
}

/**
 * Inventory index file structure
 */
interface InventoryIndex {
  version: number;
  networks: Record<string, {
    name: string;
    csvPath: string;
    deviceCount: number;
    lastUpdated: string;
  }>;
  lastUpdated: string;
}

const INVENTORY_VERSION = 1;

/**
 * Get inventory directory path
 */
export function getInventoryDir(): string {
  return ensureDir(path.join(getDataDir(), "inventory"));
}

function resolveNetworkPath(network: string): { networkName: string; networkDir: string } {
  const networkName = sanitizeNetworkName(network);
  if (!networkName) {
    throw new Error("Invalid network name");
  }

  const inventoryDir = getInventoryDir();
  const candidateDir = path.join(inventoryDir, networkName);
  const networkDir = resolvePathWithin(inventoryDir, candidateDir);

  if (!networkDir || networkDir === path.resolve(inventoryDir)) {
    throw new Error("Invalid network path");
  }

  return { networkName, networkDir };
}

/**
 * Get inventory index path
 */
function getInventoryIndexPath(): string {
  return path.join(getInventoryDir(), "index.json");
}

/**
 * Load inventory index
 */
export function loadInventoryIndex(): InventoryIndex {
  const indexPath = getInventoryIndexPath();

  if (!fs.existsSync(indexPath)) {
    return {
      version: INVENTORY_VERSION,
      networks: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch {
    return {
      version: INVENTORY_VERSION,
      networks: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save inventory index
 */
function saveInventoryIndex(index: InventoryIndex): void {
  index.lastUpdated = new Date().toISOString();
  fs.writeFileSync(getInventoryIndexPath(), JSON.stringify(index, null, 2));
}

/**
 * Parse CSV content with fault tolerance
 * Handles: blank rows, missing values, quoted fields, varied delimiters
 */
export function parseInventoryCSV(content: string, network: string): InventoryDevice[] {
  const lines = content.split(/\r?\n/);
  const devices: InventoryDevice[] = [];

  if (lines.length === 0) return devices;

  // Find header row (first non-empty line)
  let headerIndex = 0;
  while (headerIndex < lines.length && !lines[headerIndex].trim()) {
    headerIndex++;
  }

  if (headerIndex >= lines.length) return devices;

  // Parse header - normalize column names
  const headerLine = lines[headerIndex];
  const headers = parseCSVLine(headerLine).map((h) => normalizeHeader(h));

  // Find column indices (fault-tolerant mapping)
  const colMap = {
    device: findColumnIndex(headers, ["device", "name", "friendly name", "device name", "hostname"]),
    mac: findColumnIndex(headers, ["mac", "mac address", "macaddress", "physical address"]),
    vendor: findColumnIndex(headers, ["vendor", "manufacturer", "make", "oui"]),
    ip: findColumnIndex(headers, ["ip", "ip address", "ipaddress", "address"]),
    hostnames: findColumnIndex(headers, ["hostnames", "hostname", "dns", "fqdn", "dns name"]),
    status: findColumnIndex(headers, ["status", "state", "active"]),
    notes: findColumnIndex(headers, ["notes", "note", "comments", "comment", "description"]),
    securityRecs: findColumnIndex(headers, ["security recs", "security recommendations", "security", "recommendations", "recs"]),
  };

  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip blank rows

    const values = parseCSVLine(line);

    // Skip if all values are empty
    if (values.every((v) => !v.trim())) continue;

    // Extract values with defaults
    const device: InventoryDevice = {
      id: generateDeviceId(),
      device: getColumnValue(values, colMap.device) || "",
      mac: normalizeMac(getColumnValue(values, colMap.mac) || ""),
      vendor: getColumnValue(values, colMap.vendor) || "",
      ip: getColumnValue(values, colMap.ip) || "",
      hostnames: getColumnValue(values, colMap.hostnames) || "",
      status: getColumnValue(values, colMap.status) || "unknown",
      notes: getColumnValue(values, colMap.notes) || "",
      securityRecs: getColumnValue(values, colMap.securityRecs) || "",
      network,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Only add if we have at least an IP or MAC
    if (device.ip || device.mac) {
      devices.push(device);
    }
  }

  return devices;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Normalize header name for matching
 */
function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
}

/**
 * Find column index by trying multiple possible names
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (const name of possibleNames) {
    const normalized = normalizeHeader(name);
    const index = headers.findIndex((h) => h === normalized || h.includes(normalized));
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Get column value safely
 */
function getColumnValue(values: string[], index: number): string | null {
  if (index < 0 || index >= values.length) return null;
  return values[index] || null;
}

/**
 * Generate unique device ID
 */
function generateDeviceId(): string {
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalize MAC address format
 */
function normalizeMac(mac: string): string {
  // Remove all non-hex characters and convert to uppercase
  const cleaned = mac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleaned.length !== 12) return mac; // Return original if invalid

  // Format as XX:XX:XX:XX:XX:XX
  return cleaned.match(/.{2}/g)?.join(":") || mac;
}

/**
 * Import inventory from CSV file
 */
export function importInventoryCSV(csvPath: string, network: string): InventoryDevice[] {
  const { networkName, networkDir } = resolveNetworkPath(network);
  const content = fs.readFileSync(csvPath, "utf-8");
  const devices = parseInventoryCSV(content, networkName);

  // Save to inventory directory
  ensureDir(networkDir);
  const devicesPath = path.join(networkDir, "devices.json");

  // Load existing devices
  let existingDevices: InventoryDevice[] = [];
  if (fs.existsSync(devicesPath)) {
    try {
      existingDevices = JSON.parse(fs.readFileSync(devicesPath, "utf-8"));
    } catch {
      existingDevices = [];
    }
  }

  // Merge: update existing by MAC/IP, add new ones
  const merged = mergeDevices(existingDevices, devices);
  fs.writeFileSync(devicesPath, JSON.stringify(merged, null, 2));

  // Update index
  const index = loadInventoryIndex();
  index.networks[networkName] = {
    name: networkName,
    csvPath,
    deviceCount: merged.length,
    lastUpdated: new Date().toISOString(),
  };
  saveInventoryIndex(index);

  return merged;
}

/**
 * Merge device lists, updating existing records
 */
function mergeDevices(existing: InventoryDevice[], incoming: InventoryDevice[]): InventoryDevice[] {
  const byMac = new Map<string, InventoryDevice>();
  const byIp = new Map<string, InventoryDevice>();

  // Index existing devices
  for (const d of existing) {
    if (d.mac) byMac.set(d.mac.toUpperCase(), d);
    if (d.ip) byIp.set(d.ip, d);
  }

  // Process incoming devices
  const result: InventoryDevice[] = [...existing];

  for (const newDevice of incoming) {
    const existingByMac = newDevice.mac ? byMac.get(newDevice.mac.toUpperCase()) : null;
    const existingByIp = newDevice.ip ? byIp.get(newDevice.ip) : null;
    const existingDevice = existingByMac || existingByIp;

    if (existingDevice) {
      // Update existing record
      Object.assign(existingDevice, {
        ...newDevice,
        id: existingDevice.id,
        addedAt: existingDevice.addedAt,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Add new record
      result.push(newDevice);
      if (newDevice.mac) byMac.set(newDevice.mac.toUpperCase(), newDevice);
      if (newDevice.ip) byIp.set(newDevice.ip, newDevice);
    }
  }

  return result;
}

/**
 * Get inventory for a network
 */
export function getNetworkInventory(network: string): InventoryDevice[] {
  let networkDir: string;
  try {
    networkDir = resolveNetworkPath(network).networkDir;
  } catch {
    return [];
  }

  const devicesPath = path.join(networkDir, "devices.json");

  if (!fs.existsSync(devicesPath)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(devicesPath, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Add a device to inventory (promote unknown → known)
 */
export function addDeviceToInventory(
  network: string,
  device: Partial<InventoryDevice>
): InventoryDevice {
  const { networkName, networkDir } = resolveNetworkPath(network);
  const devices = getNetworkInventory(networkName);

  const newDevice: InventoryDevice = {
    id: generateDeviceId(),
    device: device.device || "",
    mac: normalizeMac(device.mac || ""),
    vendor: device.vendor || "",
    ip: device.ip || "",
    hostnames: device.hostnames || "",
    status: device.status || "active",
    notes: device.notes || "",
    securityRecs: device.securityRecs || "",
    network: networkName,
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  devices.push(newDevice);

  ensureDir(networkDir);
  fs.writeFileSync(path.join(networkDir, "devices.json"), JSON.stringify(devices, null, 2));

  // Update index
  const index = loadInventoryIndex();
  if (!index.networks[networkName]) {
    index.networks[networkName] = {
      name: networkName,
      csvPath: "",
      deviceCount: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
  index.networks[networkName].deviceCount = devices.length;
  index.networks[networkName].lastUpdated = new Date().toISOString();
  saveInventoryIndex(index);

  return newDevice;
}

/**
 * Check if a device (by IP or MAC) is in inventory
 */
export function isDeviceKnown(network: string, ip?: string, mac?: string): boolean {
  const devices = getNetworkInventory(network);

  for (const d of devices) {
    if (ip && d.ip === ip) return true;
    if (mac && d.mac.toUpperCase() === mac.toUpperCase()) return true;
  }

  return false;
}

/**
 * Get device from inventory by IP
 */
export function getDeviceByIp(network: string, ip: string): InventoryDevice | null {
  const devices = getNetworkInventory(network);
  return devices.find((d) => d.ip === ip) || null;
}

/**
 * List all networks with inventory
 */
export function listInventoryNetworks(): string[] {
  const index = loadInventoryIndex();
  return Object.keys(index.networks);
}
