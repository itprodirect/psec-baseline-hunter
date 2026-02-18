interface DiffLike {
  riskyExposures: Array<{
    ip: string;
    port: number;
    protocol: string;
    service: string;
  }>;
}

/**
 * Build top remediation actions from critical (P0) exposures.
 * Groups by port/protocol and prioritizes by affected host count.
 */
export function buildTopActions(diffData: DiffLike): string[] {
  if (diffData.riskyExposures.length === 0) {
    return [];
  }

  const grouped = new Map<
    string,
    { port: number; protocol: string; service: string; hosts: Set<string> }
  >();

  for (const exposure of diffData.riskyExposures) {
    const key = `${exposure.protocol}:${exposure.port}`;
    const entry = grouped.get(key);

    if (entry) {
      entry.hosts.add(exposure.ip);
      continue;
    }

    grouped.set(key, {
      port: exposure.port,
      protocol: exposure.protocol,
      service: exposure.service,
      hosts: new Set([exposure.ip]),
    });
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.hosts.size - a.hosts.size || a.port - b.port)
    .slice(0, 3)
    .map((entry) => {
      const target = entry.service || `port ${entry.port}`;
      const action = `Restrict external access to ${target} and verify this exposure is intentional`;
      const hostScope = entry.hosts.size === 1 ? "1 host" : `${entry.hosts.size} hosts`;
      return `${action} (${entry.port}/${entry.protocol} on ${hostScope})`;
    });
}
