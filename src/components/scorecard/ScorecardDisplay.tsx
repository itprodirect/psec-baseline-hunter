"use client";

import { AlertTriangle, Network, Server } from "lucide-react";
import { EvidenceStatusBanner } from "@/components/evidence/EvidenceStatusBanner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RiskPort, ScorecardData, TopPort } from "@/lib/types";
import { ExecutiveSummaryCard } from "@/components/scorecard/ExecutiveSummaryCard";
import { PersonalizedSummaryCard } from "@/components/scorecard/PersonalizedSummaryCard";
import { QuickRuleButton } from "@/components/scorecard/QuickRuleButton";

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

export function ScorecardDisplay({ data, actions }: ScorecardDisplayProps) {
  const canGenerateSummary = data.evidence.supports.llmSummary;

  return (
    <div className="space-y-6">
      <EvidenceStatusBanner evidence={data.evidence} summary={data.summary} />

      {canGenerateSummary && (
        <>
          <PersonalizedSummaryCard key={`personalized-${data.runUid}`} scorecardData={data} />
          <ExecutiveSummaryCard key={`executive-${data.runUid}`} scorecardData={data} />
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Observed Hosts
            </CardDescription>
            <CardTitle className="text-4xl">{data.totalHosts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Observed Open Ports
            </CardDescription>
            <CardTitle className="text-4xl">{data.openPorts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Observed Services</CardDescription>
            <CardTitle className="text-4xl">{data.uniqueServices}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={data.riskPortsDetail.length > 0 ? "border-amber-200 dark:border-amber-900" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Observed Services Requiring Review
            </CardDescription>
            <CardTitle className="text-4xl">{data.riskPortsDetail.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {actions && actions.length > 0 && data.riskPortsDetail.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Recommended Review Steps
            </CardTitle>
            <CardDescription>
              Review steps derived from the observed services and configured policy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm list-decimal list-inside">
              {actions.map((action, index) => (
                <li key={`${action}-${index}`} className="text-amber-700 dark:text-amber-300">
                  {action}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card className={data.riskPortsDetail.length > 0 ? "border-amber-200 dark:border-amber-900" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            Observed Services Requiring Review
          </CardTitle>
          <CardDescription>
            The scan vantage is unverified; these observations require contextual review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.riskPortsDetail.length > 0 ? (
            <div className="space-y-3">
              {data.riskPortsDetail.map((finding: RiskPort, index: number) => (
                <div key={`${finding.protocol}-${finding.port}-${index}`} className="flex items-start justify-between gap-4 rounded-lg bg-amber-50 p-4 dark:bg-amber-950/20">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">
                        {finding.port}/{finding.protocol}
                      </span>
                      <span className="text-muted-foreground">{finding.service}</span>
                      <RiskBadge risk={finding.risk} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Observed on {finding.hostsAffected} host{finding.hostsAffected !== 1 ? "s" : ""}: {" "}
                      <span className="font-mono text-xs">
                        {finding.hosts.slice(0, 3).join(", ")}
                        {finding.hosts.length > 3 && ` +${finding.hosts.length - 3} more`}
                      </span>
                    </p>
                  </div>
                  <QuickRuleButton riskPort={finding} network={data.network} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No review-list entries were produced by this scorecard.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Observed Ports</CardTitle>
          <CardDescription>
            Most frequently observed open ports in this run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.topPorts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">Port</th>
                    <th className="text-left py-2 px-4">Protocol</th>
                    <th className="text-left py-2 px-4">Service</th>
                    <th className="text-right py-2 px-4">Observed Host Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPorts.map((port: TopPort, index: number) => (
                    <tr key={`${port.protocol}-${port.port}-${index}`} className="border-b last:border-0">
                      <td className="py-2 px-4 font-mono">{port.port}</td>
                      <td className="py-2 px-4">{port.protocol}</td>
                      <td className="py-2 px-4">{port.service}</td>
                      <td className="py-2 px-4 text-right">{port.hostsAffected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No top-port entries were produced by this scorecard.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
