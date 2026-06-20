"use client";

import { useCallback, useEffect, useState } from "react";
import type { ElementType, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  Loader2,
  Play,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  NetworkActivityEvent,
  NetworkActivityModel,
  NetworkActivityResponse,
  NetworkActivityTechnicalDevice,
} from "@/lib/types/network-activity";

type ActivityMode = "latest" | "guided";

export function NetworkActivityView() {
  const [activity, setActivity] = useState<NetworkActivityModel | null>(null);
  const [mode, setMode] = useState<ActivityMode>("latest");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async (nextMode: ActivityMode) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        nextMode === "guided" ? "/api/activity?scenario=guided" : "/api/activity"
      );
      const result: NetworkActivityResponse = await response.json();
      if (result.success && result.activity) {
        setActivity(result.activity);
        setMode(nextMode);
      } else {
        setActivity(null);
        setError(result.error || "Network activity could not be loaded.");
      }
    } catch {
      setActivity(null);
      setError("Network activity could not be loaded. Try again from this page.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivity("latest");
  }, [loadActivity]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Activity</h1>
          <p className="text-muted-foreground">
            What changed since the last useful observation?
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === "latest" ? "default" : "outline"}
            onClick={() => loadActivity("latest")}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Latest observations
          </Button>
          <Button
            variant={mode === "guided" ? "default" : "outline"}
            onClick={() => loadActivity("guided")}
            disabled={isLoading}
          >
            <Play className="h-4 w-4" />
            Guided scenario
          </Button>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            Loading network activity...
          </CardContent>
        </Card>
      )}

      {error && !isLoading && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Activity unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {activity && !isLoading && (
        <>
          <ActivityHeader activity={activity} onLoadGuided={() => loadActivity("guided")} />
          <LimitationsPanel activity={activity} />
          {activity.scenario && <GuidedScenarioPanel activity={activity} />}
          {activity.period && <ComparisonPeriodCard activity={activity} />}
          <EventTimeline activity={activity} />
        </>
      )}
    </div>
  );
}

function ActivityHeader({
  activity,
  onLoadGuided,
}: {
  activity: NetworkActivityModel;
  onLoadGuided: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900">
              <Activity className="h-5 w-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-amber-950 dark:text-amber-100">
                  {activity.status === "ready" ? "Latest useful comparison" : stateTitle(activity.status)}
                </h2>
                {activity.source === "synthetic-guided-scenario" && (
                  <Badge variant="secondary">Synthetic scenario</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                {activity.summary}
              </p>
              {activity.status === "empty" && (
                <Button size="sm" className="mt-4" onClick={onLoadGuided}>
                  <Play className="h-4 w-4" />
                  Open guided scenario
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={Clock}
          label="Last checked"
          value={formatDateTime(activity.latestObservation?.checkedAt)}
          detail={activity.site?.networkName ?? "No site selected"}
        />
        <MetricCard
          icon={Shield}
          label="Freshness"
          value={<FreshnessBadge activity={activity} />}
          detail={activity.latestObservation?.freshnessReason ?? "No observation freshness yet"}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Coverage sources"
          value={formatSourceCount(activity.coverage?.sources.present.length ?? 0)}
          detail={formatSources(activity.coverage?.sources.present)}
        />
        <MetricCard
          icon={Compass}
          label="Collection vantage"
          value={activity.coverage?.vantage.label ?? "Not available"}
          detail={activity.coverage?.vantage.runType ?? activity.coverage?.vantage.networkName ?? "No collection details"}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Needs review"
          value={String(activity.reviewCount)}
          detail={activity.reviewCount === 1 ? "1 item in the timeline" : `${activity.reviewCount} items in the timeline`}
        />
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function LimitationsPanel({ activity }: { activity: NetworkActivityModel }) {
  const hasLimitations = activity.limitations.length > 0;

  return (
    <Card className={hasLimitations ? "border-amber-200 dark:border-amber-900" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Coverage and Freshness Limits
        </CardTitle>
        <CardDescription>
          These limits bound what the timeline can and cannot say.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasLimitations ? (
          <ul className="space-y-2 text-sm">
            {activity.limitations.map((limitation) => (
              <li key={`${limitation.code}-${limitation.message}`} className="flex gap-2">
                <Badge
                  variant={limitation.severity === "warning" ? "default" : "secondary"}
                  className="mt-0.5 h-fit"
                >
                  {limitation.severity}
                </Badge>
                <span className="text-muted-foreground">{limitation.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No coverage or freshness limitations were reported for this comparison. This is still not an all-clear.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function GuidedScenarioPanel({ activity }: { activity: NetworkActivityModel }) {
  if (!activity.scenario) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Play className="h-5 w-5" />
          {activity.scenario.title}
        </CardTitle>
        <CardDescription>
          Synthetic observations only. No real network data is used in this walkthrough.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm text-muted-foreground">
          {activity.scenario.steps.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="font-medium text-foreground">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ComparisonPeriodCard({ activity }: { activity: NetworkActivityModel }) {
  if (!activity.period) return null;

  return (
    <Card id="comparison-period">
      <CardHeader>
        <CardTitle className="text-lg">Comparison Period</CardTitle>
        <CardDescription>
          Each change below is tied to this earlier-to-later observation pair.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Earlier observation</p>
            <p className="mt-1 font-medium">{formatDateTime(activity.period.baselineObservedAt)}</p>
          </div>
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Current observation</p>
            <p className="mt-1 font-medium">{formatDateTime(activity.period.currentObservedAt)}</p>
          </div>
        </div>
        <details className="rounded-md border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Show technical comparison references
          </summary>
          <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <EvidenceRow label="Earlier observation ID" value={activity.period.baselineObservationId} />
            <EvidenceRow label="Current observation ID" value={activity.period.currentObservationId} />
            <EvidenceRow label="Earlier source run" value={activity.period.baselineRunUid} />
            <EvidenceRow label="Current source run" value={activity.period.currentRunUid} />
          </dl>
        </details>
      </CardContent>
    </Card>
  );
}

function EventTimeline({ activity }: { activity: NetworkActivityModel }) {
  if (activity.status !== "ready") {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">{stateTitle(activity.status)}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            {activity.summary}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (activity.events.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
          <p className="mt-3 font-medium">No meaningful changes found</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            The comparison did not produce change events. This is limited to the coverage, freshness, and sources shown above.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Changes</CardTitle>
        <CardDescription>
          Technical identifiers are hidden until a supporting evidence section is opened.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {activity.events.map((event) => (
          <EventCard key={event.eventId} event={event} />
        ))}
      </CardContent>
    </Card>
  );
}

function EventCard({ event }: { event: NetworkActivityEvent }) {
  return (
    <article className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{event.title}</h3>
            <Badge variant={event.confidence === "low" ? "outline" : "secondary"}>
              {event.confidenceLabel}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{event.summary}</p>
        </div>
      </div>
      <p className="mt-3 text-sm">{event.reviewReason}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <a className="text-primary underline-offset-4 hover:underline" href={event.periodHref}>
          Comparison period
        </a>
        <a className="text-primary underline-offset-4 hover:underline" href={`#${event.evidenceId}`}>
          Supporting evidence
        </a>
      </div>
      <details id={event.evidenceId} className="mt-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Eye className="h-4 w-4" />
          Show technical evidence
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">{event.evidenceSummary}</p>
          <Separator />
          <dl className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
            <EvidenceRow label="Rule" value={`${event.technicalEvidence.ruleId} (${event.technicalEvidence.ruleVersion})`} />
            <EvidenceRow label="Identity rule" value={event.technicalEvidence.identityRuleId} />
            <EvidenceRow label="Earlier observation" value={event.technicalEvidence.baselineObservationId} />
            <EvidenceRow label="Current observation" value={event.technicalEvidence.currentObservationId} />
            <EvidenceRow label="Identity values" value={formatList(event.technicalEvidence.identityValues)} />
            <EvidenceRow
              label="Evidence IDs"
              value={formatList([
                ...event.technicalEvidence.identityEvidenceIds.baseline,
                ...event.technicalEvidence.identityEvidenceIds.current,
              ])}
            />
            <EvidenceRow label="Earlier device" value={formatDevice(event.technicalEvidence.baselineDevice)} />
            <EvidenceRow label="Current device" value={formatDevice(event.technicalEvidence.currentDevice)} />
            <EvidenceRow label="Port or service evidence" value={formatPort(event)} />
            <EvidenceRow label="Changed fields" value={formatList(event.technicalEvidence.changedFields)} />
            <EvidenceRow label="Notes" value={formatList(event.technicalEvidence.notes)} />
          </dl>
        </div>
      </details>
    </article>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{label}</dt>
      <dd className="break-words font-mono text-[11px] leading-relaxed">{value || "None"}</dd>
    </div>
  );
}

function FreshnessBadge({ activity }: { activity: NetworkActivityModel }) {
  const status = activity.latestObservation?.freshnessStatus;
  if (!status) return <Badge variant="secondary">No observations</Badge>;

  const variant = status === "fresh" ? "secondary" : status === "aging" ? "outline" : "default";
  return <Badge variant={variant}>{status}</Badge>;
}

function stateTitle(status: NetworkActivityModel["status"]): string {
  const titles: Record<NetworkActivityModel["status"], string> = {
    empty: "No observations yet",
    "one-observation": "One observation available",
    "no-comparison": "No useful comparison yet",
    ready: "Latest useful comparison",
  };
  return titles[status];
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSources(sources: string[] | undefined): string {
  if (!sources || sources.length === 0) return "No sources reported";
  return sources.join(", ");
}

function formatSourceCount(count: number): string {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None";
}

function formatDevice(device: NetworkActivityTechnicalDevice | null): string {
  if (!device) return "None";
  return [
    `deviceId=${device.deviceId}`,
    `ips=${formatList(device.ips)}`,
    `macs=${formatList(device.macs)}`,
    `hostnames=${formatList(device.hostnames)}`,
    `vendors=${formatList(device.vendors)}`,
  ].join("; ");
}

function formatPort(event: NetworkActivityEvent): string {
  const port = event.technicalEvidence.port;
  if (!port) return "None";
  return [
    `direction=${port.direction}`,
    `protocol=${port.protocol}`,
    `port=${port.port}`,
    `service=${port.service ?? "unknown"}`,
    `product=${port.product ?? "unknown"}`,
    `version=${port.version ?? "unknown"}`,
    `sourceId=${port.sourceId}`,
  ].join("; ");
}
