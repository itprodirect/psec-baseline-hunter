import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { EvidenceAssessment } from "@/lib/types";

interface EvidenceStatusBannerProps {
  evidence: EvidenceAssessment;
  summary: string;
}

function formatCoverage(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function EvidenceStatusBanner({ evidence, summary }: EvidenceStatusBannerProps) {
  const statusStyle = evidence.status === "supported"
    ? {
        card: "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20",
        icon: CheckCircle2,
        iconClass: "text-blue-600 dark:text-blue-400",
      }
    : evidence.status === "insufficient-evidence"
      ? {
          card: "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
          icon: AlertTriangle,
          iconClass: "text-amber-600 dark:text-amber-400",
        }
      : {
          card: "border-violet-200 bg-violet-50/50 dark:border-violet-900 dark:bg-violet-950/20",
          icon: HelpCircle,
          iconClass: "text-violet-600 dark:text-violet-400",
        };
  const StatusIcon = statusStyle.icon;
  const coverage = [
    ...(evidence.coverage.baseline
      ? [{ label: "Baseline coverage", value: evidence.coverage.baseline }]
      : []),
    { label: "Current coverage", value: evidence.coverage.current },
  ];

  return (
    <Card
      className={statusStyle.card}
      data-evidence-status={evidence.status}
      role="status"
      aria-label={`Evidence status: ${evidence.status}`}
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-3">
          <StatusIcon className={`h-5 w-5 mt-0.5 shrink-0 ${statusStyle.iconClass}`} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Evidence status</span>
              <Badge variant={evidence.status === "supported" ? "secondary" : "outline"}>
                {evidence.status}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                {evidence.version}
              </Badge>
            </div>

            <p className="text-sm">{summary}</p>

            <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              {coverage.map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">
                    {value.status} ({formatCoverage(value.score)})
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-muted-foreground">Identity</dt>
                <dd className="font-medium">
                  {evidence.identity.status}
                  {evidence.identity.uncertainCount > 0
                    ? ` (${evidence.identity.uncertainCount} uncertain)`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vantage</dt>
                <dd className="font-medium">{evidence.vantage.kind}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reachability</dt>
                <dd className="font-medium">{evidence.vantage.externalReachability}</dd>
              </div>
            </dl>

            {evidence.limitations.length > 0 && (
              <div>
                <p className="text-xs font-medium">Limitations</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {evidence.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
