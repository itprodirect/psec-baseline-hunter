"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, AlertTriangle, Shield, Server, Network, ChevronDown, Loader2 } from "lucide-react";
import { useDemo } from "@/lib/context/demo-context";
import { ScorecardData, RiskPort, TopPort, RunManifestInfo, RunsListResponseV2 } from "@/lib/types";
import { PersonalizedSummaryCard } from "@/components/scorecard/PersonalizedSummaryCard";
import { PortImpactCard } from "@/components/scorecard/PortImpactCard";
import { ExecutiveSummaryCard } from "@/components/scorecard/ExecutiveSummaryCard";

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RiskBadge({ risk }: { risk: string }) {
  const variants: Record<string, "destructive" | "default" | "secondary"> = {
    P0: "destructive",
    P1: "default",
    P2: "secondary",
  };
  return <Badge variant={variants[risk] || "secondary"}>{risk}</Badge>;
}

interface ScorecardDisplayProps {
  data: ScorecardData;
  actions?: string[];
}

function ScorecardDisplay({ data, actions }: ScorecardDisplayProps) {
  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                Analysis Summary
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {data.summary}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personalized Explanation Card */}
      <PersonalizedSummaryCard scorecardData={data} />

      {/* Executive Summary Card */}
      <ExecutiveSummaryCard scorecardData={data} />

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Total Hosts
            </CardDescription>
            <CardTitle className="text-4xl">{data.totalHosts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Open Ports
            </CardDescription>
            <CardTitle className="text-4xl">{data.openPorts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Services</CardDescription>
            <CardTitle className="text-4xl">{data.uniqueServices}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Risk Ports
            </CardDescription>
            <CardTitle className="text-4xl flex items-center gap-2">
              {data.riskPorts}
              {data.riskPorts > 0 && (
                <Badge variant="destructive" className="text-xs">
                  Action Needed
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Top 3 Actions */}
      {actions && actions.length > 0 && data.riskPorts > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Recommended Actions
            </CardTitle>
            <CardDescription>
              Top priorities based on risk analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm list-decimal list-inside">
              {actions.map((action, idx) => (
                <li key={idx} className="text-amber-700 dark:text-amber-300">
                  {action}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Risk Ports Detail */}
      {data.riskPortsDetail.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Risk Exposures
            </CardTitle>
            <CardDescription>
              Ports requiring immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.riskPortsDetail.map((rp: RiskPort, idx: number) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-start justify-between p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">
                          {rp.port}/{rp.protocol}
                        </span>
                        <span className="text-muted-foreground">{rp.service}</span>
                        <RiskBadge risk={rp.risk} />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Exposed on {rp.hostsAffected} host{rp.hostsAffected !== 1 ? "s" : ""}:{" "}
                        <span className="font-mono text-xs">
                          {rp.hosts.slice(0, 3).join(", ")}
                          {rp.hosts.length > 3 && ` +${rp.hosts.length - 3} more`}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Show Real-World Impact for P0 and P1 only */}
                  {(rp.risk === "P0" || rp.risk === "P1") && (
                    <PortImpactCard riskPort={rp} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Ports Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Ports</CardTitle>
          <CardDescription>
            Most common open ports across scanned hosts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Port</th>
                  <th className="text-left py-2 px-4">Protocol</th>
                  <th className="text-left py-2 px-4">Service</th>
                  <th className="text-right py-2 px-4">Hosts Affected</th>
                </tr>
              </thead>
              <tbody>
                {data.topPorts.map((tp: TopPort, idx: number) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 px-4 font-mono">{tp.port}</td>
                    <td className="py-2 px-4">{tp.protocol}</td>
                    <td className="py-2 px-4">{tp.service}</td>
                    <td className="py-2 px-4 text-right">{tp.hostsAffected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ScorecardPage() {
  const { isDemoMode, demoData } = useDemo();
  const [runs, setRuns] = useState<RunManifestInfo[]>([]);
  const [selectedRunUid, setSelectedRunUid] = useState<string | null>(null);
  const [scorecardData, setScorecardData] = useState<ScorecardData | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRunSelector, setShowRunSelector] = useState(false);

  // Load runs on mount
  useEffect(() => {
    async function loadRuns() {
      setIsLoadingRuns(true);
      try {
        const response = await fetch("/api/runs");
        const data: RunsListResponseV2 = await response.json();
        if (data.success && data.runs) {
          setRuns(data.runs);
        }
      } catch (err) {
        console.error("Failed to load runs:", err);
      } finally {
        setIsLoadingRuns(false);
      }
    }
    loadRuns();
  }, []);

  // Load scorecard when run is selected
  useEffect(() => {
    if (!selectedRunUid || isDemoMode) return;

    async function loadScorecard() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/scorecard/${selectedRunUid}`);
        const data = await response.json();
        if (data.success && data.data) {
          setScorecardData(data.data);
          setActions(data.data.actions || []);
        } else {
          setError(data.error || "Failed to load scorecard");
          setScorecardData(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load scorecard");
        setScorecardData(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadScorecard();
  }, [selectedRunUid, isDemoMode]);

  // Use demo data when in demo mode
  const displayData = isDemoMode && demoData ? demoData.currentScorecard : scorecardData;
  const displayActions = isDemoMode && demoData ? [] : actions;

  const selectedRun = runs.find((r) => r.runUid === selectedRunUid);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Health Overview</h1>
        <p className="text-muted-foreground">
          {displayData
            ? `${displayData.network} - ${formatTimestamp(displayData.timestamp)}`
            : "Analyze a single baseline scan run"}
        </p>
      </div>

      {/* Run Selector (hidden in demo mode) */}
      {!isDemoMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Select Run
            </CardTitle>
            <CardDescription>
              Choose a run to analyze
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRuns ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading runs...
              </div>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No runs available. Upload a baselinekit ZIP first, or click{" "}
                <strong>Load Demo Data</strong> on the Upload page to try with sample data.
              </p>
            ) : (
              <div className="relative">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setShowRunSelector(!showRunSelector)}
                >
                  {selectedRun ? (
                    <span>
                      {selectedRun.network} - {selectedRun.folderName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select a run...</span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
                {showRunSelector && (
                  <div className="absolute z-10 mt-1 w-full bg-background border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {runs.map((run) => (
                      <button
                        key={run.runUid}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg"
                        onClick={() => {
                          setSelectedRunUid(run.runUid);
                          setShowRunSelector(false);
                        }}
                      >
                        <div className="font-medium">{run.network}</div>
                        <div className="text-xs text-muted-foreground">
                          {run.folderName} • {run.stats.hasPortsScan ? "Has ports scan" : "No ports scan"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Analyzing scan data...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Scorecard Display */}
      {displayData && !isLoading ? (
        <ScorecardDisplay data={displayData} actions={displayActions} />
      ) : !isLoading && !error && !isDemoMode && selectedRunUid === null && runs.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Hosts</CardDescription>
                <CardTitle className="text-4xl">—</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Open Ports</CardDescription>
                <CardTitle className="text-4xl">—</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Services</CardDescription>
                <CardTitle className="text-4xl">—</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Risk Ports</CardDescription>
                <CardTitle className="text-4xl">—</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Ports</CardTitle>
              <CardDescription>
                Most common open ports across scanned hosts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Select a run above to view port analysis.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
