"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, ChevronDown, Loader2 } from "lucide-react";
import { RunManifestInfo } from "@/lib/types";

interface ScorecardRunSelectorProps {
  runs: RunManifestInfo[];
  isLoadingRuns: boolean;
  selectedRunUid: string | null;
  showRunSelector: boolean;
  setShowRunSelector: (open: boolean) => void;
  onSelectRun: (runUid: string) => void;
}

export function ScorecardRunSelector({
  runs,
  isLoadingRuns,
  selectedRunUid,
  showRunSelector,
  setShowRunSelector,
  onSelectRun,
}: ScorecardRunSelectorProps) {
  const selectedRun = runs.find((r) => r.runUid === selectedRunUid);

  return (
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
                      onSelectRun(run.runUid);
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
  );
}
