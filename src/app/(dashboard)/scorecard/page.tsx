"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useDemo } from "@/lib/context/demo-context";
import { ScorecardData, RunManifestInfo, RunsListResponseV2 } from "@/lib/types";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { downloadCSV, formatDateForFilename, scorecardToCSV } from "@/lib/utils/csv-export";
import { ScorecardDisplay } from "@/components/scorecard/ScorecardDisplay";
import { ScorecardRunSelector } from "@/components/scorecard/ScorecardRunSelector";
import { ScorecardEmptyState } from "@/components/scorecard/ScorecardEmptyState";

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const scorecardRequest = useRef(0);

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

  // Auto-select newest run for a simpler first experience
  useEffect(() => {
    if (isDemoMode) return;
    if (!selectedRunUid && runs.length > 0) {
      setSelectedRunUid(runs[0].runUid);
    }
  }, [isDemoMode, runs, selectedRunUid]);

  useEffect(() => {
    const requestId = ++scorecardRequest.current;
    if (!selectedRunUid || isDemoMode) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadScorecard() {
      setIsLoading(true);
      setError(null);
      setScorecardData(null);
      setActions([]);
      try {
        const response = await fetch(`/api/scorecard/${selectedRunUid}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted || requestId !== scorecardRequest.current) return;

        if (data.success && data.data) {
          setScorecardData(data.data);
          setActions(data.data.actions || []);
        } else {
          setError(data.error || "Failed to load scorecard");
          setScorecardData(null);
        }
      } catch (err) {
        if (controller.signal.aborted || requestId !== scorecardRequest.current) return;
        setError(err instanceof Error ? err.message : "Failed to load scorecard");
        setScorecardData(null);
      } finally {
        if (!controller.signal.aborted && requestId === scorecardRequest.current) {
          setIsLoading(false);
        }
      }
    }
    loadScorecard();

    return () => controller.abort();
  }, [selectedRunUid, isDemoMode]);

  const displayData = isDemoMode && demoData ? demoData.currentScorecard : scorecardData;
  const displayActions = isDemoMode && demoData
    ? demoData.currentScorecard.riskPortsDetail.slice(0, 3).map((finding) =>
        `Review whether the observed ${finding.protocol.toUpperCase()} service on port ${finding.port} is expected and appropriately access-controlled.`
      )
    : actions;

  const handleSelectRun = (runUid: string) => {
    scorecardRequest.current += 1;
    setSelectedRunUid(runUid);
    setScorecardData(null);
    setActions([]);
    setError(null);
    setIsLoading(false);
  };

  const handleExportCSV = () => {
    if (!displayData) return;

    const date = formatDateForFilename(displayData.timestamp || new Date());
    const network = displayData.network.replace(/[^a-z0-9-]/gi, "_");
    downloadCSV(scorecardToCSV(displayData), `${network}_${date}_scorecard.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Health Overview</h1>
          <p className="text-muted-foreground">
            {displayData
              ? `${displayData.network} - ${formatTimestamp(displayData.timestamp)}`
              : "Analyze a single baseline scan run"}
          </p>
        </div>
        {displayData && (
          <ExportCSVButton onExport={handleExportCSV} />
        )}
      </div>

      {!isDemoMode && (
        <ScorecardRunSelector
          runs={runs}
          isLoadingRuns={isLoadingRuns}
          selectedRunUid={selectedRunUid}
          showRunSelector={showRunSelector}
          setShowRunSelector={setShowRunSelector}
          onSelectRun={handleSelectRun}
        />
      )}

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

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}

      {displayData && !isLoading ? (
        <ScorecardDisplay data={displayData} actions={displayActions} />
      ) : !isLoading && !error && !isDemoMode && selectedRunUid === null && runs.length > 0 ? (
        <ScorecardEmptyState />
      ) : null}
    </div>
  );
}
