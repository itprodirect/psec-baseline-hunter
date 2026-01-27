/**
 * Rules Registry Service
 * Manages custom risk rules with per-network support
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import {
  CustomRiskRule,
  RulesRegistry,
  CreateRuleRequest,
  RiskLevel,
} from "@/lib/types";
import { getDataDir, ensureDir } from "./ingest";

const REGISTRY_VERSION = 1;

/**
 * Get path to rules registry directory
 */
export function getRulesDir(): string {
  return ensureDir(path.join(getDataDir(), "rules"));
}

/**
 * Get path to rules registry index file
 */
function getRegistryIndexPath(): string {
  return path.join(getRulesDir(), "index.json");
}

/**
 * Load the rules registry
 */
export function loadRulesRegistry(): RulesRegistry {
  const indexPath = getRegistryIndexPath();

  if (!fs.existsSync(indexPath)) {
    return {
      version: REGISTRY_VERSION,
      rules: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    const content = fs.readFileSync(indexPath, "utf-8");
    return JSON.parse(content) as RulesRegistry;
  } catch (error) {
    console.error("Failed to load rules registry:", error);
    return {
      version: REGISTRY_VERSION,
      rules: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save the rules registry
 */
function saveRulesRegistry(registry: RulesRegistry): void {
  const indexPath = getRegistryIndexPath();
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(registry, null, 2));
}

/**
 * Generate a unique rule ID
 */
export function generateRuleId(
  port: number,
  protocol: string,
  network: string
): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${network}_${port}_${protocol}_${Date.now()}`)
    .digest("hex")
    .slice(0, 8);
  const sanitizedNetwork = network.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${sanitizedNetwork}_${port}_${protocol}_${hash}`;
}

/**
 * Create a new rule
 */
export function createRule(request: CreateRuleRequest): CustomRiskRule {
  const registry = loadRulesRegistry();

  // Validate request
  if (request.action === "override" && !request.customRisk) {
    throw new Error("customRisk is required when action is 'override'");
  }

  // Check for existing rule for this port/protocol/network
  const existingRule = findRule(request.port, request.protocol, request.network);
  if (existingRule) {
    throw new Error(
      `Rule already exists for port ${request.port}/${request.protocol} on network "${request.network}"`
    );
  }

  const rule: CustomRiskRule = {
    ruleId: generateRuleId(request.port, request.protocol, request.network),
    port: request.port,
    protocol: request.protocol as "tcp" | "udp",
    network: request.network,
    action: request.action,
    customRisk: request.action === "override" ? request.customRisk : undefined,
    reason: request.reason,
    createdAt: new Date().toISOString(),
  };

  registry.rules[rule.ruleId] = rule;
  saveRulesRegistry(registry);

  return rule;
}

/**
 * Find a rule for a specific port/protocol/network
 */
export function findRule(
  port: number,
  protocol: string,
  network: string
): CustomRiskRule | null {
  const registry = loadRulesRegistry();

  for (const rule of Object.values(registry.rules)) {
    if (
      rule.port === port &&
      rule.protocol === protocol &&
      rule.network.toLowerCase() === network.toLowerCase()
    ) {
      return rule;
    }
  }

  return null;
}

/**
 * Find a rule by ID
 */
export function getRuleById(ruleId: string): CustomRiskRule | null {
  const registry = loadRulesRegistry();
  return registry.rules[ruleId] || null;
}

/**
 * List all rules, optionally filtered by network
 */
export function listRules(network?: string): CustomRiskRule[] {
  const registry = loadRulesRegistry();
  let rules = Object.values(registry.rules);

  if (network) {
    rules = rules.filter(
      (r) =>
        r.network.toLowerCase() === network.toLowerCase() || r.network === "*"
    );
  }

  // Sort by network, then port
  rules.sort((a, b) => {
    if (a.network !== b.network) {
      // Global rules first
      if (a.network === "*") return -1;
      if (b.network === "*") return 1;
      return a.network.localeCompare(b.network);
    }
    return a.port - b.port;
  });

  return rules;
}

/**
 * Update an existing rule
 */
export function updateRule(
  ruleId: string,
  updates: Partial<Omit<CustomRiskRule, "ruleId" | "createdAt">>
): CustomRiskRule | null {
  const registry = loadRulesRegistry();

  if (!(ruleId in registry.rules)) {
    return null;
  }

  const rule = registry.rules[ruleId];

  // Apply updates
  if (updates.action !== undefined) rule.action = updates.action;
  if (updates.customRisk !== undefined) rule.customRisk = updates.customRisk;
  if (updates.reason !== undefined) rule.reason = updates.reason;

  // Clear customRisk if action changed to whitelist
  if (rule.action === "whitelist") {
    rule.customRisk = undefined;
  }

  registry.rules[ruleId] = rule;
  saveRulesRegistry(registry);

  return rule;
}

/**
 * Delete a rule
 */
export function deleteRule(ruleId: string): boolean {
  const registry = loadRulesRegistry();

  if (!(ruleId in registry.rules)) {
    return false;
  }

  delete registry.rules[ruleId];
  saveRulesRegistry(registry);

  return true;
}

/**
 * Get effective risk level for a port, considering custom rules
 * This is the main function used by the diff engine
 *
 * Priority:
 * 1. Network-specific rule
 * 2. Global rule (network = "*")
 * 3. Default classification (from risk-ports.ts)
 */
export function getEffectiveRisk(
  port: number,
  protocol: string,
  network: string,
  defaultRisk: RiskLevel | null
): RiskLevel | null {
  // 1. Check network-specific rule
  const networkRule = findRule(port, protocol, network);
  if (networkRule) {
    if (networkRule.action === "whitelist") return null;
    if (networkRule.action === "override") return networkRule.customRisk || null;
  }

  // 2. Check global rule
  const globalRule = findRule(port, protocol, "*");
  if (globalRule) {
    if (globalRule.action === "whitelist") return null;
    if (globalRule.action === "override") return globalRule.customRisk || null;
  }

  // 3. Fall back to default
  return defaultRisk;
}

/**
 * Get all unique networks that have rules
 */
export function listRuleNetworks(): string[] {
  const rules = listRules();
  const networks = new Set(rules.map((r) => r.network));
  return Array.from(networks).sort();
}

/**
 * Get registry statistics
 */
export function getRulesStats(): {
  totalRules: number;
  globalRules: number;
  networkRules: number;
  networks: string[];
} {
  const rules = listRules();
  const globalRules = rules.filter((r) => r.network === "*");
  const networkRules = rules.filter((r) => r.network !== "*");
  const networks = [...new Set(networkRules.map((r) => r.network))];

  return {
    totalRules: rules.length,
    globalRules: globalRules.length,
    networkRules: networkRules.length,
    networks,
  };
}
