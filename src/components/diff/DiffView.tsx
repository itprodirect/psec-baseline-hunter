"use client";

import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, HelpCircle, Minus, Plus } from "lucide-react";
import { EvidenceStatusBanner } from "@/components/evidence/EvidenceStatusBanner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  DiffData,
  HostChange,
  IdentityUncertainChange,
  PortChange,
  RiskLevel,
} from "@/lib/types";

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
  const variants: Record<RiskLevel, "destructive" | "default" | "secondary"> = {
    P0: "destructive",
    P1: "default",
    P2: "secondary",
  };
  return <Badge variant={variants[risk]}>{risk}</Badge>;
}

function FindingMetric({
  label,
  value,
  icon: Icon,
  emphasized = false,
}: {
  label: string;
  value: number | string;
  icon: typeof Plus;
  emphasized?: boolean;
}) {
  return (
    <Card className={emphasized ? "border-amber-200 dark:border-amber-900" : ""}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function HostTable({ entries }: { entries: HostChange[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-4">IP Address</th>
            <th className="text-left py-2 px-4">Hostname</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={`${entry.ip}-${index}`} className="border-b last:border-0">
              <td className="py-2 px-4 font-mono">{entry.ip}</td>
              <td className="py-2 px-4">{entry.hostname || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PortTable({ entries, showClassification = false }: {
  entries: PortChange[];
  showClassification?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-4">Host</th>
            <th className="text-left py-2 px-4">Port</th>
            <th className="text-left py-2 px-4">Service</th>
            {showClassification && <th className="text-left py-2 px-4">Classification</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={`${entry.ip}-${entry.protocol}-${entry.port}-${index}`} className="border-b last:border-0">
              <td className="py-2 px-4">
                <span className="font-mono">{entry.ip}</span>
                {entry.hostname && (
                  <span className="ml-2 text-muted-foreground">({entry.hostname})</span>
                )}
              </td>
              <td className="py-2 px-4 font-mono">{entry.port}/{entry.protocol}</td>
              <td className="py-2 px-4">{entry.service || "unknown"}</td>
              {showClassification && (
                <td className="py-2 px-4"><RiskBadge risk={entry.risk} /></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IdentityTable({ entries }: { entries: IdentityUncertainChange[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-4">Baseline locator</th>
            <th className="text-left py-2 px-4">Current locator</th>
            <th className="text-left py-2 px-4">Confidence</th>
            <th className="text-left py-2 px-4">Evidence note</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={`${entry.baselineIp || "none"}-${entry.currentIp || "none"}-${index}`} className="border-b last:border-0">
              <td className="py-2 px-4 font-mono">{entry.baselineIp || "—"}</td>
              <td className="py-2 px-4 font-mono">{entry.currentIp || "—"}</td>
              <td className="py-2 px-4"><Badge variant="outline">{entry.confidence}</Badge></td>
              <td className="py-2 px-4">{entry.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DiffViewProps {
  data: DiffData;
  preDetails?: ReactNode;
  exportSection: ReactNode;
}

export function DiffView({ data, preDetails, exportSection }: DiffViewProps) {
  const supportsAbsence = data.evidence.supports.deviceAbsence;
  const supportsClosure = data.evidence.supports.portClosure;

  return (
    <div className="space-y-6">
      <EvidenceStatusBanner evidence={data.evidence} summary={data.summary} />

      {preDetails}

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <FindingMetric label="Added-device findings" value={data.newHosts.length} icon={Plus} emphasized={data.newHosts.length > 0} />
        <FindingMetric label="Device-absence findings" value={supportsAbsence ? data.removedHosts.length : "Not evaluated"} icon={Minus} emphasized={supportsAbsence && data.removedHosts.length > 0} />
        <FindingMetric label="Service-addition findings" value={data.portsOpened.length} icon={Plus} emphasized={data.portsOpened.length > 0} />
        <FindingMetric label="Service-closure findings" value={supportsClosure ? data.portsClosed.length : "Not evaluated"} icon={Minus} emphasized={supportsClosure && data.portsClosed.length > 0} />
        <FindingMetric label="Identity uncertainty" value={data.identityUncertain.length} icon={HelpCircle} emphasized={data.identityUncertain.length > 0} />
        <FindingMetric label="Observed services requiring review" value={data.riskFindings.length} icon={AlertTriangle} emphasized={data.riskFindings.length > 0} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="summary">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="devices">Devices</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-4">
              <div className="space-y-3 rounded-lg bg-muted p-4 text-sm">
                <p>{data.newHosts.length} added-device finding(s) were produced.</p>
                <p>
                  {supportsAbsence
                    ? `${data.removedHosts.length} device-absence finding(s) were produced.`
                    : "Device absence was not evaluated because the evidence does not support that conclusion."}
                </p>
                <p>{data.portsOpened.length} service-addition finding(s) were produced.</p>
                <p>
                  {supportsClosure
                    ? `${data.portsClosed.length} service-closure finding(s) were produced.`
                    : "Service closure was not evaluated because the evidence does not support that conclusion."}
                </p>
                <p>{data.identityUncertain.length} identity-uncertainty entr{data.identityUncertain.length === 1 ? "y was" : "ies were"} produced.</p>
                <p>{data.riskFindings.length} review-list entr{data.riskFindings.length === 1 ? "y was" : "ies were"} produced.</p>
              </div>
            </TabsContent>

            <TabsContent value="devices" className="mt-4 space-y-5">
              <section>
                <h4 className="mb-2 flex items-center gap-2 font-semibold">
                  <Plus className="h-4 w-4" />
                  Added-device findings ({data.newHosts.length})
                </h4>
                {data.newHosts.length > 0
                  ? <HostTable entries={data.newHosts} />
                  : <p className="text-sm text-muted-foreground">No added-device findings were produced by this comparison.</p>}
              </section>

              <section>
                <h4 className="mb-2 flex items-center gap-2 font-semibold">
                  <Minus className="h-4 w-4" />
                  Device-absence findings
                </h4>
                {!supportsAbsence ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Not evaluated because the evidence does not support device-absence conclusions.
                  </p>
                ) : data.removedHosts.length > 0 ? (
                  <HostTable entries={data.removedHosts} />
                ) : (
                  <p className="text-sm text-muted-foreground">No device-absence findings were produced by this comparison.</p>
                )}
              </section>

              <section>
                <h4 className="mb-2 flex items-center gap-2 font-semibold">
                  <HelpCircle className="h-4 w-4" />
                  Identity uncertainty ({data.identityUncertain.length})
                </h4>
                {data.identityUncertain.length > 0
                  ? <IdentityTable entries={data.identityUncertain} />
                  : <p className="text-sm text-muted-foreground">No identity-uncertainty entries were produced by this comparison.</p>}
              </section>
            </TabsContent>

            <TabsContent value="services" className="mt-4 space-y-5">
              <section>
                <h4 className="mb-2 flex items-center gap-2 font-semibold">
                  <Plus className="h-4 w-4" />
                  Service-addition findings ({data.portsOpened.length})
                </h4>
                {data.portsOpened.length > 0
                  ? <PortTable entries={data.portsOpened} showClassification />
                  : <p className="text-sm text-muted-foreground">No service-addition findings were produced by this comparison.</p>}
              </section>

              <section>
                <h4 className="mb-2 flex items-center gap-2 font-semibold">
                  <Minus className="h-4 w-4" />
                  Service-closure findings
                </h4>
                {!supportsClosure ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Not evaluated because the evidence does not support service-closure conclusions.
                  </p>
                ) : data.portsClosed.length > 0 ? (
                  <PortTable entries={data.portsClosed} />
                ) : (
                  <p className="text-sm text-muted-foreground">No service-closure findings were produced by this comparison.</p>
                )}
              </section>
            </TabsContent>

            <TabsContent value="review" className="mt-4">
              <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                <div>
                  <h4 className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    Observed services requiring review ({data.riskFindings.length})
                  </h4>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    The scan vantage is unverified; the result does not establish reachability beyond that vantage.
                  </p>
                </div>
                {data.riskFindings.length > 0
                  ? <PortTable entries={data.riskFindings} showClassification />
                  : <p className="text-sm text-muted-foreground">No review-list entries were produced by this comparison.</p>}
              </div>
            </TabsContent>

            <TabsContent value="export" className="mt-4">
              {exportSection}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
