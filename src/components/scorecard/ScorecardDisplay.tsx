"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Server, Network } from "lucide-react";
import { ScorecardData, RiskPort, TopPort } from "@/lib/types";
import { PersonalizedSummaryCard } from "@/components/scorecard/PersonalizedSummaryCard";
import { PortImpactCard } from "@/components/scorecard/PortImpactCard";
import { ExecutiveSummaryCard } from "@/components/scorecard/ExecutiveSummaryCard";
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
  return (
    <div className="space-y-6">
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

      <PersonalizedSummaryCard scorecardData={data} />
      <ExecutiveSummaryCard scorecardData={data} />

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
                    <QuickRuleButton riskPort={rp} network={data.network} />
                  </div>

                  {(rp.risk === "P0" || rp.risk === "P1") && (
                    <PortImpactCard riskPort={rp} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
