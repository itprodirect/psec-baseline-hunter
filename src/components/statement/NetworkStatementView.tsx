"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { ObservationRegistryEntry } from "@/lib/types/observation-registry";
import type {
  NetworkStatementItemSeverity,
  NetworkStatementModel,
  NetworkStatementResponse,
} from "@/lib/types/network-statement";

interface ObservationsResponse {
  success: boolean;
  observations?: ObservationRegistryEntry[];
  error?: string;
}

interface SiteOption {
  siteId: string;
  networkName: string;
  latestObservedAt: string;
  observationCount: number;
}

export function NetworkStatementView() {
  const [observations, setObservations] = useState<ObservationRegistryEntry[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statement, setStatement] = useState<NetworkStatementModel | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sites = useMemo(() => buildSiteOptions(observations), [observations]);

  const loadObservations = useCallback(async () => {
    setIsLoadingSites(true);
    setError(null);
    try {
      const response = await fetch("/api/observations?order=desc&limit=200");
      const result: ObservationsResponse = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Observation list could not be loaded.");
      }
      setObservations(result.observations ?? []);
    } catch (loadError) {
      setObservations([]);
      setError(loadError instanceof Error ? loadError.message : "Observation list could not be loaded.");
    } finally {
      setIsLoadingSites(false);
    }
  }, []);

  useEffect(() => {
    loadObservations();
  }, [loadObservations]);

  useEffect(() => {
    if (selectedSiteId || sites.length === 0) return;
    const firstSite = sites[0];
    setSelectedSiteId(firstSite.siteId);
    const latestDate = toDateInput(firstSite.latestObservedAt);
    setToDate(latestDate);
    setFromDate(offsetDateInput(latestDate, -6));
  }, [selectedSiteId, sites]);

  const generateStatement = useCallback(async () => {
    if (!selectedSiteId || !fromDate || !toDate) return;
    setIsGenerating(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        siteId: selectedSiteId,
        from: fromDate,
        to: toDate,
      });
      const response = await fetch(`/api/statement?${params.toString()}`);
      const result: NetworkStatementResponse = await response.json();
      if (!response.ok || !result.success || !result.statement) {
        throw new Error(result.error || "Statement could not be generated.");
      }
      setStatement(result.statement);
      setMarkdown(result.markdown ?? "");
    } catch (generateError) {
      setStatement(null);
      setMarkdown("");
      setError(generateError instanceof Error ? generateError.message : "Statement could not be generated.");
    } finally {
      setIsGenerating(false);
    }
  }, [fromDate, selectedSiteId, toDate]);

  useEffect(() => {
    if (selectedSiteId && fromDate && toDate && !statement && !isGenerating) {
      generateStatement();
    }
  }, [fromDate, generateStatement, isGenerating, selectedSiteId, statement, toDate]);

  const selectedSite = sites.find((site) => site.siteId === selectedSiteId) ?? null;
  const canGenerate = Boolean(selectedSiteId && fromDate && toDate && !isGenerating);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Statement</h1>
          <p className="text-muted-foreground">
            Deterministic statement from stored observations and responses.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadObservations} disabled={isLoadingSites || isGenerating}>
            {isLoadingSites ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <RefreshCw data-icon="inline-start" />}
            Refresh
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!statement}>
            <Printer data-icon="inline-start" />
            Print
          </Button>
          <Button variant="outline" onClick={() => downloadMarkdown(markdown, statement)} disabled={!statement || !markdown}>
            <Download data-icon="inline-start" />
            Markdown
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-lg">Statement Range</CardTitle>
          <CardDescription>
            Choose a stored site and date range. Packet Highway evidence remains supplemental.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="flex flex-col gap-2">
            <Label htmlFor="statement-site">Site</Label>
            <Select
              value={selectedSiteId}
              onValueChange={(value) => {
                setSelectedSiteId(value);
                const nextSite = sites.find((site) => site.siteId === value);
                if (nextSite) {
                  const latestDate = toDateInput(nextSite.latestObservedAt);
                  setToDate(latestDate);
                  setFromDate(offsetDateInput(latestDate, -6));
                }
                setStatement(null);
                setMarkdown("");
              }}
              disabled={isLoadingSites || sites.length === 0}
            >
              <SelectTrigger id="statement-site" aria-label="Site">
                <SelectValue placeholder={isLoadingSites ? "Loading sites" : "Select a site"} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sites.map((site) => (
                    <SelectItem key={site.siteId} value={site.siteId}>
                      {site.networkName} ({site.observationCount})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="statement-from">From</Label>
            <Input
              id="statement-from"
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setStatement(null);
                setMarkdown("");
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="statement-to">To</Label>
            <Input
              id="statement-to"
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setStatement(null);
                setMarkdown("");
              }}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={generateStatement} disabled={!canGenerate}>
              {isGenerating ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <FileText data-icon="inline-start" />}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="print:hidden">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Statement unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoadingSites && !statement && (
        <Card className="print:hidden">
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="animate-spin motion-reduce:animate-none" />
            Loading observations...
          </CardContent>
        </Card>
      )}

      {!isLoadingSites && sites.length === 0 && (
        <Card className="print:hidden">
          <CardContent className="py-10 text-center">
            <p className="font-medium">No stored observations</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Import observation bundles before generating a Network Statement.
            </p>
          </CardContent>
        </Card>
      )}

      {isGenerating && (
        <Card className="print:hidden">
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="animate-spin motion-reduce:animate-none" />
            Generating statement...
          </CardContent>
        </Card>
      )}

      {statement && (
        <article className="mx-auto flex w-full max-w-5xl flex-col gap-5 print:max-w-none print:gap-3">
          <header className="rounded-md border bg-background p-6 print:border-0 print:p-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight print:text-xl">
                  {statement.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {statement.selectedPeriod.label}
                </p>
              </div>
              <Badge variant={statement.status === "ready" ? "secondary" : "default"}>
                {statement.status === "ready" ? "Ready" : "Insufficient evidence"}
              </Badge>
            </div>
            {selectedSite && (
              <p className="mt-3 text-sm text-muted-foreground">
                {selectedSite.networkName} - {selectedSite.observationCount} stored observations
              </p>
            )}
          </header>

          {statement.sections.map((section) => (
            <section
              key={section.id}
              className="rounded-md border bg-background p-5 print:break-inside-avoid print:border-0 print:p-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold print:text-base">{section.title}</h3>
                {section.secondary && <Badge variant="outline">Secondary</Badge>}
              </div>
              {section.summary && (
                <p className="mt-1 text-sm text-muted-foreground">{section.summary}</p>
              )}
              <Separator className="my-4 print:my-2" />
              <ul className="flex flex-col gap-3 text-sm print:gap-2">
                {section.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <Badge variant={badgeVariant(item.severity)} className="mt-0.5">
                        {item.severity}
                      </Badge>
                      <span className="leading-relaxed">{item.text}</span>
                    </div>
                    {item.evidenceRefs.length > 0 && (
                      <div className="ml-20 flex flex-wrap gap-2 text-xs print:ml-0">
                        {item.evidenceRefs.map((ref) => (
                          <a
                            key={`${item.id}-${ref.href}-${ref.label}`}
                            href={ref.href}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {ref.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </article>
      )}
    </div>
  );
}

function buildSiteOptions(observations: ObservationRegistryEntry[]): SiteOption[] {
  const bySite = new Map<string, SiteOption>();

  for (const observation of observations) {
    if (isSupplementalObservation(observation)) continue;
    const observedAt = observationTime(observation);
    if (!observedAt) continue;

    const existing = bySite.get(observation.site.siteId);
    if (!existing) {
      bySite.set(observation.site.siteId, {
        siteId: observation.site.siteId,
        networkName: observation.networkName,
        latestObservedAt: observedAt,
        observationCount: 1,
      });
      continue;
    }

    existing.observationCount += 1;
    if (Date.parse(observedAt) > Date.parse(existing.latestObservedAt)) {
      existing.latestObservedAt = observedAt;
      existing.networkName = observation.networkName;
    }
  }

  return [...bySite.values()].sort(
    (a, b) => Date.parse(b.latestObservedAt) - Date.parse(a.latestObservedAt)
  );
}

function isSupplementalObservation(observation: ObservationRegistryEntry): boolean {
  return (
    observation.vantage.type.startsWith("packet-highway-") ||
    observation.sources.some((source) => source.kind === "packet-highway-analysis")
  );
}

function observationTime(entry: ObservationRegistryEntry): string | null {
  return entry.timeRange.endedAt ?? entry.timeRange.startedAt ?? entry.timeRange.generatedAt;
}

function toDateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function offsetDateInput(dateInput: string, days: number): string {
  if (!dateInput) return "";
  const date = new Date(`${dateInput}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function badgeVariant(severity: NetworkStatementItemSeverity): "default" | "secondary" | "outline" {
  if (severity === "warning") return "default";
  if (severity === "review") return "outline";
  return "secondary";
}

function downloadMarkdown(markdown: string, statement: NetworkStatementModel | null): void {
  if (!statement || !markdown) return;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${statement.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${statement.selectedPeriod.from.slice(0, 10)}-to-${statement.selectedPeriod.to.slice(0, 10)}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
