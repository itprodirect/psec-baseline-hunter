"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { GitCompare, AlertTriangle, Plus, Minus, Shield, ArrowRight } from "lucide-react";
import { useDemo } from "@/lib/context/demo-context";
import { DiffData, HostChange, PortChange, RiskLevel } from "@/lib/types";
import { PersonalizedDiffCard } from "@/components/diff/PersonalizedDiffCard";

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RiskBadge({ risk }: { risk?: RiskLevel }) {
  if (!risk) return null;
  const variants: Record<string, "destructive" | "default" | "secondary"> = {
    P0: "destructive",
    P1: "default",
    P2: "secondary",
  };
  return <Badge variant={variants[risk] || "secondary"}>{risk}</Badge>;
}

function DiffDisplay({ data }: { data: DiffData }) {
  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900">
              <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                Change Summary
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {data.summary}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personalized Change Report Card */}
      <PersonalizedDiffCard diffData={data} />

      {/* Comparison Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-muted-foreground">Baseline</p>
              <p className="font-mono font-semibold">{formatTimestamp(data.baselineTimestamp)}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="text-center">
              <p className="text-muted-foreground">Current</p>
              <p className="font-mono font-semibold">{formatTimestamp(data.currentTimestamp)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className={data.newHosts.length > 0 ? "border-green-200 dark:border-green-900" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-green-600" />
              New Hosts
            </CardDescription>
            <CardTitle className="text-2xl">{data.newHosts.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={data.removedHosts.length > 0 ? "border-gray-200 dark:border-gray-700" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-gray-500" />
              Removed Hosts
            </CardDescription>
            <CardTitle className="text-2xl">{data.removedHosts.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={data.portsOpened.length > 0 ? "border-yellow-200 dark:border-yellow-900" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-yellow-600" />
              Ports Opened
            </CardDescription>
            <CardTitle className="text-2xl">{data.portsOpened.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-gray-500" />
              Ports Closed
            </CardDescription>
            <CardTitle className="text-2xl">{data.portsClosed.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={data.riskyExposures.length > 0 ? "border-red-200 dark:border-red-900" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Risky Exposures
            </CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {data.riskyExposures.length}
              {data.riskyExposures.length > 0 && (
                <Badge variant="destructive" className="text-xs">P0</Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs with Details */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="summary">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="hosts">Hosts</TabsTrigger>
              <TabsTrigger value="ports">Ports</TabsTrigger>
              <TabsTrigger value="risk">Risk Flags</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-4">
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">What Changed</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>{data.newHosts.length} new hosts appeared on the network</li>
                    <li>{data.removedHosts.length} hosts were removed or went offline</li>
                    <li>{data.portsOpened.length} new ports were opened</li>
                    <li>{data.portsClosed.length} ports were closed</li>
                    <li className="text-red-600 dark:text-red-400 font-medium">
                      {data.riskyExposures.length} critical (P0) exposures require immediate attention
                    </li>
                  </ul>
                </div>

                {data.riskyExposures.length > 0 && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                    <h4 className="font-semibold mb-2 text-red-700 dark:text-red-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Top 3 Actions Required
                    </h4>
                    <ol className="text-sm space-y-2 text-red-600 dark:text-red-300 list-decimal list-inside">
                      <li>Block RDP (3389) at perimeter firewall for workstations 100-102</li>
                      <li>Isolate fileserver-02 SMB (445) to internal VLAN only</li>
                      <li>Review change management records for unauthorized service enablement</li>
                    </ol>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="hosts" className="mt-4">
              <div className="space-y-4">
                {data.newHosts.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-green-600" />
                      New Hosts ({data.newHosts.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4">IP Address</th>
                            <th className="text-left py-2 px-4">Hostname</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.newHosts.map((h: HostChange, idx: number) => (
                            <tr key={idx} className="border-b last:border-0 bg-green-50/50 dark:bg-green-950/10">
                              <td className="py-2 px-4 font-mono">{h.ip}</td>
                              <td className="py-2 px-4">{h.hostname || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {data.removedHosts.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Minus className="h-4 w-4 text-gray-500" />
                      Removed Hosts ({data.removedHosts.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4">IP Address</th>
                            <th className="text-left py-2 px-4">Hostname</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.removedHosts.map((h: HostChange, idx: number) => (
                            <tr key={idx} className="border-b last:border-0 bg-gray-50/50 dark:bg-gray-950/10">
                              <td className="py-2 px-4 font-mono line-through">{h.ip}</td>
                              <td className="py-2 px-4 line-through">{h.hostname || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {data.newHosts.length === 0 && data.removedHosts.length === 0 && (
                  <p className="text-sm text-muted-foreground">No host changes detected.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="ports" className="mt-4">
              <div className="space-y-4">
                {data.portsOpened.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-yellow-600" />
                      Ports Opened ({data.portsOpened.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4">Host</th>
                            <th className="text-left py-2 px-4">Port</th>
                            <th className="text-left py-2 px-4">Service</th>
                            <th className="text-left py-2 px-4">Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.portsOpened.map((p: PortChange, idx: number) => (
                            <tr key={idx} className={`border-b last:border-0 ${p.risk === "P0" ? "bg-red-50/50 dark:bg-red-950/10" : "bg-yellow-50/50 dark:bg-yellow-950/10"}`}>
                              <td className="py-2 px-4">
                                <span className="font-mono">{p.ip}</span>
                                {p.hostname && <span className="text-muted-foreground ml-2">({p.hostname})</span>}
                              </td>
                              <td className="py-2 px-4 font-mono">{p.port}/{p.protocol}</td>
                              <td className="py-2 px-4">{p.service}</td>
                              <td className="py-2 px-4"><RiskBadge risk={p.risk} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {data.portsClosed.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Minus className="h-4 w-4 text-gray-500" />
                      Ports Closed ({data.portsClosed.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4">Host</th>
                            <th className="text-left py-2 px-4">Port</th>
                            <th className="text-left py-2 px-4">Service</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.portsClosed.map((p: PortChange, idx: number) => (
                            <tr key={idx} className="border-b last:border-0 bg-gray-50/50 dark:bg-gray-950/10">
                              <td className="py-2 px-4">
                                <span className="font-mono line-through">{p.ip}</span>
                                {p.hostname && <span className="text-muted-foreground ml-2 line-through">({p.hostname})</span>}
                              </td>
                              <td className="py-2 px-4 font-mono line-through">{p.port}/{p.protocol}</td>
                              <td className="py-2 px-4 line-through">{p.service}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {data.portsOpened.length === 0 && data.portsClosed.length === 0 && (
                  <p className="text-sm text-muted-foreground">No port changes detected.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="risk" className="mt-4">
              {data.riskyExposures.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                    <h4 className="font-semibold mb-2 text-red-700 dark:text-red-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Critical Exposures (P0)
                    </h4>
                    <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                      These newly exposed services pose immediate security risk and require action.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-red-200 dark:border-red-800">
                            <th className="text-left py-2 px-4">Host</th>
                            <th className="text-left py-2 px-4">Port</th>
                            <th className="text-left py-2 px-4">Service</th>
                            <th className="text-left py-2 px-4">Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.riskyExposures.map((p: PortChange, idx: number) => (
                            <tr key={idx} className="border-b border-red-100 dark:border-red-900 last:border-0">
                              <td className="py-2 px-4">
                                <span className="font-mono">{p.ip}</span>
                                {p.hostname && <span className="text-red-500 dark:text-red-400 ml-2">({p.hostname})</span>}
                              </td>
                              <td className="py-2 px-4 font-mono">{p.port}/{p.protocol}</td>
                              <td className="py-2 px-4">{p.service}</td>
                              <td className="py-2 px-4"><RiskBadge risk={p.risk} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                  <h4 className="font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    No Critical Exposures
                  </h4>
                  <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                    No new P0 risk exposures detected in this comparison.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="export" className="mt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Export comparison results for documentation and compliance.
                </p>
                <div className="flex gap-4">
                  <button
                    className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium transition-colors"
                    onClick={() => {
                      const content = `# CHANGES.md\n\n## Comparison: ${data.baselineTimestamp} → ${data.currentTimestamp}\n\n${data.summary}\n\n### New Hosts (${data.newHosts.length})\n${data.newHosts.map(h => `- ${h.ip} (${h.hostname || "unknown"})`).join("\n")}\n\n### Ports Opened (${data.portsOpened.length})\n${data.portsOpened.map(p => `- ${p.ip}:${p.port}/${p.protocol} (${p.service})${p.risk ? ` [${p.risk}]` : ""}`).join("\n")}`;
                      const blob = new Blob([content], { type: "text/markdown" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "CHANGES.md";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download CHANGES.md
                  </button>
                  <button
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium transition-colors"
                    onClick={() => {
                      const content = `# WATCHLIST.md\n\n## Critical Exposures Requiring Action\n\nGenerated: ${new Date().toISOString()}\n\n${data.riskyExposures.map(p => `### ${p.ip} - ${p.hostname || "unknown"}\n- **Port:** ${p.port}/${p.protocol}\n- **Service:** ${p.service}\n- **Risk Level:** ${p.risk}\n- **Action Required:** Block at perimeter or isolate to internal network\n`).join("\n")}`;
                      const blob = new Blob([content], { type: "text/markdown" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "WATCHLIST.md";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download WATCHLIST.md
                  </button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DiffPage() {
  const { isDemoMode, demoData } = useDemo();

  const diffData = isDemoMode && demoData ? demoData.diff : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Changes</h1>
        <p className="text-muted-foreground">
          {diffData
            ? `Comparing runs on ${diffData.network}`
            : "Compare baseline scans to detect changes"}
        </p>
      </div>

      {diffData ? (
        <DiffDisplay data={diffData} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="h-5 w-5" />
                Select Comparison
              </CardTitle>
              <CardDescription>
                Choose network, run type, and comparison preset
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No runs available. Upload at least two baselinekit ZIPs to compare,
                or click <strong>Load Demo Data</strong> on the Upload page to try with sample data.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>New Hosts</CardDescription>
                <CardTitle className="text-2xl">—</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Removed Hosts</CardDescription>
                <CardTitle className="text-2xl">—</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ports Opened</CardDescription>
                <CardTitle className="text-2xl">—</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ports Closed</CardDescription>
                <CardTitle className="text-2xl">—</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Risky Exposures</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  —
                  <Badge variant="destructive" className="text-xs">P0</Badge>
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="summary">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="hosts">Hosts</TabsTrigger>
                  <TabsTrigger value="ports">Ports</TabsTrigger>
                  <TabsTrigger value="risk">Risk Flags</TabsTrigger>
                  <TabsTrigger value="export">Export</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Run a comparison to see summary results.
                  </p>
                </TabsContent>
                <TabsContent value="hosts" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    New and removed hosts will appear here.
                  </p>
                </TabsContent>
                <TabsContent value="ports" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Opened and closed ports will appear here.
                  </p>
                </TabsContent>
                <TabsContent value="risk" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    P0, P1, and P2 risk flags will appear here.
                  </p>
                </TabsContent>
                <TabsContent value="export" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Download CHANGES.md and WATCHLIST.md exports.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
