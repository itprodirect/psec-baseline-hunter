interface DiffLike {
  riskFindings: Array<{
    ip: string;
    port: number;
    protocol: string;
    service: string;
  }>;
}

/**
 * Build top review actions from newly observed P0/P1-classified services.
 * Groups by port/protocol and prioritizes by affected host count.
 */
export function buildTopActions(diffData: DiffLike): string[] {
  if (diffData.riskFindings.length === 0) {
    return [];
  }

  const grouped = new Map<
    string,
    { port: number; protocol: string; service: string; hosts: Set<string> }
  >();

  for (const finding of diffData.riskFindings) {
    const key = `${finding.protocol}:${finding.port}`;
    const entry = grouped.get(key);

    if (entry) {
      entry.hosts.add(finding.ip);
      continue;
    }

    grouped.set(key, {
      port: finding.port,
      protocol: finding.protocol,
      service: finding.service,
      hosts: new Set([finding.ip]),
    });
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.hosts.size - a.hosts.size || a.port - b.port)
    .slice(0, 3)
    .map((entry) => {
      const target = entry.service || `port ${entry.port}`;
      const action = `Review access controls for ${target} and confirm the observed service is intentional`;
      const hostScope = entry.hosts.size === 1 ? "1 host" : `${entry.hosts.size} hosts`;
      return `${action} (${entry.port}/${entry.protocol} on ${hostScope})`;
    });
}
