"use client";

import { RunManifestInfo } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, FolderOpen, FileText, Clock, Network } from "lucide-react";
import { cn } from "@/lib/utils";

interface RunListProps {
  runs: RunManifestInfo[];
  loading?: boolean;
  emptyMessage?: string;
}

export function RunList({
  runs,
  loading = false,
  emptyMessage = "No runs detected yet. Upload a baselinekit ZIP to get started.",
}: RunListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-5 bg-muted rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <RunCard key={run.runUid} run={run} />
      ))}
    </div>
  );
}

interface RunCardProps {
  run: RunManifestInfo;
}

function RunCard({ run }: RunCardProps) {
  const keyFileCount = run.stats?.keyFileCount ?? Object.values(run.keyFiles).flat().length;
  const keyFileLabels = Object.keys(run.keyFiles);

  // Format timestamp
  const timestamp = run.timestamp ? new Date(run.timestamp) : null;

  const formattedDate = timestamp
    ? timestamp.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unknown date";

  const formattedTime = timestamp
    ? timestamp.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="font-medium truncate" title={run.folderName}>
                {run.folderName}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {run.network && (
                <div className="flex items-center gap-1">
                  <Network className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">{run.network}</span>
                </div>
              )}

              {timestamp && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formattedDate}</span>
                </div>
              )}

              {formattedTime && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formattedTime}</span>
                </div>
              )}

              {run.runType && (
                <span className="px-2 py-0.5 bg-muted rounded-full text-xs">
                  {run.runType}
                </span>
              )}
            </div>

            {keyFileLabels.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex flex-wrap gap-1">
                  {keyFileLabels.map((label) => (
                    <span
                      key={label}
                      className={cn(
                        "px-2 py-0.5 text-xs rounded-full",
                        getKeyFileBadgeClass(label)
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="text-right shrink-0">
            <span className="text-2xl font-bold text-primary">{keyFileCount}</span>
            <p className="text-xs text-muted-foreground">files</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getKeyFileBadgeClass(label: string): string {
  const classes: Record<string, string> = {
    discovery: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    hosts_up: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    ports: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    http_titles: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    infra_services: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
    gateway_smoke: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    snapshots: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return classes[label] || "bg-muted text-muted-foreground";
}
