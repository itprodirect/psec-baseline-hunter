"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GitCompare, ArrowRight, Loader2 } from "lucide-react";
import { useDemo } from "@/lib/context/demo-context";
import { DiffData, RunManifestInfo, RunsListResponseV2, SavedComparison, ComparisonResponse } from "@/lib/types";
import { PersonalizedDiffCard } from "@/components/diff/PersonalizedDiffCard";
import { RulesManagerCard } from "@/components/rules/RulesManagerCard";
import {
  diffToCSV,
  diffToMarkdown,
  downloadCSV,
  formatDateForFilename,
  reviewListToCSV,
  reviewListToMarkdown,
} from "@/lib/utils/csv-export";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { DiffView } from "@/components/diff/DiffView";
import { RunSelector } from "@/components/diff/RunSelector";
import { SaveComparisonDialog } from "@/components/diff/SaveComparisonDialog";
import { ComparisonHistoryDialog } from "@/components/diff/ComparisonHistoryDialog";
import { DiffEmptyState } from "@/components/diff/DiffEmptyState";

function DiffDisplay({ data }: { data: DiffData }) {
  const downloadMarkdown = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DiffView
      data={data}
      preDetails={data.evidence.supports.llmSummary
        ? <PersonalizedDiffCard key={`${data.baselineRunUid}:${data.currentRunUid}`} diffData={data} />
        : undefined}
      exportSection={(
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Every export includes the evidence status, coverage, identity, vantage, and limitations.
          </p>

          <div>
            <h4 className="text-sm font-medium mb-2">Markdown Reports</h4>
            <div className="flex gap-4">
              <button
                className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium transition-colors"
                onClick={() => downloadMarkdown(diffToMarkdown(data), "COMPARISON.md")}
              >
                Download COMPARISON.md
              </button>
              {data.riskFindings.length > 0 && (
                <button
                  className="px-4 py-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium transition-colors"
                  onClick={() => downloadMarkdown(reviewListToMarkdown(data), "REVIEW-LIST.md")}
                >
                  Download REVIEW-LIST.md
                </button>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">CSV Exports</h4>
            <div className="flex gap-3">
              <ExportCSVButton
                label="All Changes"
                onExport={() => {
                  const csv = diffToCSV(data);
                  const date = formatDateForFilename(data.currentTimestamp);
                  const network = data.network.replace(/[^a-z0-9-]/gi, "_");
                  downloadCSV(csv, `${network}_${date}_changes.csv`);
                }}
              />
              {data.riskFindings.length > 0 && (
                <ExportCSVButton
                  label="Review List"
                  variant="default"
                  onExport={() => {
                    const csv = reviewListToCSV(data.riskFindings, data.evidence);
                    const date = formatDateForFilename(data.currentTimestamp);
                    const network = data.network.replace(/[^a-z0-9-]/gi, "_");
                    downloadCSV(csv, `${network}_${date}_review-list.csv`);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    />
  );
}

export default function DiffPage() {
  const { isDemoMode, demoData } = useDemo();
  const router = useRouter();

  const [runs, setRuns] = useState<RunManifestInfo[]>([]);
  const [baselineRunUid, setBaselineRunUid] = useState<string | null>(null);
  const [currentRunUid, setCurrentRunUid] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<DiffData | null>(null);

  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBaselineSelector, setShowBaselineSelector] = useState(false);
  const [showCurrentSelector, setShowCurrentSelector] = useState(false);

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [history, setHistory] = useState<SavedComparison[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const comparisonRequest = useRef(0);

  useEffect(() => {
    const comparisonId = new URLSearchParams(window.location.search).get("comparison");
    if (comparisonId) {
      router.replace(`/diff/${encodeURIComponent(comparisonId)}`);
    }
  }, [router]);

  useEffect(() => {
    async function loadRuns() {
      setIsLoadingRuns(true);
      try {
        const response = await fetch("/api/runs");
        const data: RunsListResponseV2 = await response.json();
        if (data.success && data.runs) {
          const sortedRuns = [...data.runs].sort((a, b) =>
            new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
          );
          setRuns(sortedRuns);
        }
      } catch (err) {
        console.error("Failed to load runs:", err);
      } finally {
        setIsLoadingRuns(false);
      }
    }
    loadRuns();
  }, []);

  useEffect(() => {
    if (isDemoMode || runs.length < 2) return;

    const selectedCurrent = currentRunUid || runs[0].runUid;
    if (!currentRunUid) {
      setCurrentRunUid(selectedCurrent);
    }

    if (!baselineRunUid || baselineRunUid === selectedCurrent) {
      const fallbackBaseline = runs.find((run) => run.runUid !== selectedCurrent);
      if (fallbackBaseline) {
        setBaselineRunUid(fallbackBaseline.runUid);
      }
    }
  }, [baselineRunUid, currentRunUid, isDemoMode, runs]);

  useEffect(() => {
    comparisonRequest.current += 1;
    setDiffData(null);
    setError(null);
    setIsComparing(false);
  }, [baselineRunUid, currentRunUid]);

  async function handleCompare() {
    if (!baselineRunUid || !currentRunUid || baselineRunUid === currentRunUid) {
      setDiffData(null);
      setError("Select two different runs before comparing.");
      return;
    }

    const requestId = ++comparisonRequest.current;

    setIsComparing(true);
    setError(null);
    setDiffData(null);

    try {
      const response = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineRunUid, currentRunUid }),
      });

      const result = await response.json();
      if (requestId !== comparisonRequest.current) return;

      if (result.success && result.data) {
        setDiffData(result.data);
      } else {
        setDiffData(null);
        setError(result.error || "Failed to compute diff");
      }
    } catch (err) {
      if (requestId !== comparisonRequest.current) return;
      setDiffData(null);
      setError(err instanceof Error ? err.message : "Failed to compute diff");
    } finally {
      if (requestId === comparisonRequest.current) {
        setIsComparing(false);
      }
    }
  }

  async function handleSaveComparison() {
    if (!diffData?.evidence.supports.comparisonPersistence) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineRunUid: diffData.baselineRunUid,
          currentRunUid: diffData.currentRunUid,
          title: saveTitle || undefined,
          notes: saveNotes || undefined,
        }),
      });

      const result: ComparisonResponse = await response.json();

      if (result.success && result.comparison) {
        setIsSaveDialogOpen(false);
        setSaveTitle("");
        setSaveNotes("");
      } else {
        setSaveError(result.error || "Failed to save comparison");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save comparison");
    } finally {
      setIsSaving(false);
    }
  }

  async function loadHistory() {
    setIsLoadingHistory(true);
    try {
      const response = await fetch("/api/comparisons");
      const data: ComparisonResponse = await response.json();
      if (data.success && data.comparisons) {
        setHistory(data.comparisons);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function handleDeleteComparison(comparisonId: string) {
    try {
      const response = await fetch(`/api/comparisons/${comparisonId}`, {
        method: "DELETE",
      });
      const result: ComparisonResponse = await response.json();
      if (result.success) {
        setHistory((prev) => prev.filter((c) => c.comparisonId !== comparisonId));
      }
    } catch (err) {
      console.error("Failed to delete comparison:", err);
    }
  }

  const displayData = isDemoMode && demoData ? demoData.diff : diffData;
  const hasEnoughRuns = runs.length >= 2;
  const canCompare = baselineRunUid && currentRunUid && baselineRunUid !== currentRunUid;

  function selectBaseline(runUid: string) {
    comparisonRequest.current += 1;
    setBaselineRunUid(runUid);
    setDiffData(null);
    setIsComparing(false);
    setError(null);
    setSaveError(null);
  }

  function selectCurrent(runUid: string) {
    comparisonRequest.current += 1;
    setCurrentRunUid(runUid);
    setDiffData(null);
    setIsComparing(false);
    setError(null);
    setSaveError(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Changes</h1>
        <p className="text-muted-foreground">
          {displayData
            ? `Comparing runs on ${displayData.network}`
            : "Compare baseline scans to detect changes"}
        </p>
      </div>

      {!isDemoMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              Select Comparison
            </CardTitle>
            <CardDescription>
              Choose a baseline (older) and current (newer) run to compare
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRuns ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading runs...
              </div>
            ) : !hasEnoughRuns ? (
              <p className="text-sm text-muted-foreground">
                You need at least two runs to compare. Upload baselinekit ZIPs first, or click{" "}
                <strong>Load Demo Data</strong> on the Upload page to try with sample data.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <RunSelector
                    label="Baseline (older)"
                    runs={runs}
                    selectedRunUid={baselineRunUid}
                    onSelect={selectBaseline}
                    disabledRunUid={currentRunUid}
                    isOpen={showBaselineSelector}
                    onToggle={() => {
                      setShowBaselineSelector(!showBaselineSelector);
                      setShowCurrentSelector(false);
                    }}
                  />
                  <div className="pt-8">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <RunSelector
                    label="Current (newer)"
                    runs={runs}
                    selectedRunUid={currentRunUid}
                    onSelect={selectCurrent}
                    disabledRunUid={baselineRunUid}
                    isOpen={showCurrentSelector}
                    onToggle={() => {
                      setShowCurrentSelector(!showCurrentSelector);
                      setShowBaselineSelector(false);
                    }}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleCompare}
                    disabled={!canCompare || isComparing}
                  >
                    {isComparing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Comparing...
                      </>
                    ) : (
                      <>
                        <GitCompare className="h-4 w-4 mr-2" />
                        Compare Runs
                      </>
                    )}
                  </Button>
                  {diffData?.evidence.supports.comparisonPersistence && (
                      <SaveComparisonDialog
                        open={isSaveDialogOpen}
                        onOpenChange={setIsSaveDialogOpen}
                        isSaving={isSaving}
                        error={saveError}
                        network={diffData.network}
                        title={saveTitle}
                        notes={saveNotes}
                        onTitleChange={setSaveTitle}
                        onNotesChange={setSaveNotes}
                        onSave={handleSaveComparison}
                      />
                  )}

                  <ComparisonHistoryDialog
                    open={isHistoryDialogOpen}
                    onOpenChange={(open) => {
                      setIsHistoryDialogOpen(open);
                      if (open) {
                        loadHistory();
                      }
                    }}
                    comparisons={history}
                    isLoading={isLoadingHistory}
                    onDeleteComparison={handleDeleteComparison}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isDemoMode && (
        <RulesManagerCard
          network={diffData?.network}
          onRulesChange={() => {
            if (diffData && baselineRunUid && currentRunUid) {
              handleCompare();
            }
          }}
        />
      )}

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}

      {isComparing && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Computing differences...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {displayData && !isComparing ? (
        <DiffDisplay data={displayData} />
      ) : !isComparing && !error && !isDemoMode && !displayData ? (
        <DiffEmptyState />
      ) : null}
    </div>
  );
}
