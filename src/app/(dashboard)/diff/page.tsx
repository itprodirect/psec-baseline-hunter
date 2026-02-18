"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GitCompare, ArrowRight, ChevronDown, Loader2, Save, History, Trash2 } from "lucide-react";
import { useDemo } from "@/lib/context/demo-context";
import { DiffData, RunManifestInfo, RunsListResponseV2, SavedComparison, ComparisonResponse } from "@/lib/types";
import { PersonalizedDiffCard } from "@/components/diff/PersonalizedDiffCard";
import { RulesManagerCard } from "@/components/rules/RulesManagerCard";
import { diffToCSV, watchlistToCSV, downloadCSV, formatDateForFilename } from "@/lib/utils/csv-export";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { DiffView } from "@/components/diff/DiffView";
import { buildTopActions } from "@/lib/services/diff-actions";

function DiffDisplay({ data }: { data: DiffData }) {
  const topActions = buildTopActions(data);

  return (
    <DiffView
      data={data}
      preDetails={<PersonalizedDiffCard diffData={data} />}
      topActions={topActions}
      riskExposureIntroText="These newly exposed services pose immediate security risk and require action."
      riskNoExposureText="No new P0 risk exposures detected in this comparison."
      exportSection={(
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export comparison results for documentation and compliance.
          </p>

          <div>
            <h4 className="text-sm font-medium mb-2">Markdown Reports</h4>
            <div className="flex gap-4">
              <button
                className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium transition-colors"
                onClick={() => {
                  const content = `# CHANGES.md\n\n## Comparison: ${data.baselineTimestamp} -> ${data.currentTimestamp}\n\n${data.summary}\n\n### New Hosts (${data.newHosts.length})\n${data.newHosts.map((h) => `- ${h.ip} (${h.hostname || "unknown"})`).join("\n")}\n\n### Ports Opened (${data.portsOpened.length})\n${data.portsOpened.map((p) => `- ${p.ip}:${p.port}/${p.protocol} (${p.service})${p.risk ? ` [${p.risk}]` : ""}`).join("\n")}`;
                  const blob = new Blob([content], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "CHANGES.md";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download CHANGES.md
              </button>
              <button
                className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium transition-colors"
                onClick={() => {
                  const content = `# WATCHLIST.md\n\n## Critical Exposures Requiring Action\n\nGenerated: ${new Date().toISOString()}\n\n${data.riskyExposures.map((p) => `### ${p.ip} - ${p.hostname || "unknown"}\n- **Port:** ${p.port}/${p.protocol}\n- **Service:** ${p.service}\n- **Risk Level:** ${p.risk}\n- **Action Required:** Block at perimeter or isolate to internal network\n`).join("\n")}`;
                  const blob = new Blob([content], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "WATCHLIST.md";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download WATCHLIST.md
              </button>
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
              {data.riskyExposures.length > 0 && (
                <ExportCSVButton
                  label="Watchlist Only"
                  variant="default"
                  onExport={() => {
                    const csv = watchlistToCSV(data.riskyExposures);
                    const date = formatDateForFilename(data.currentTimestamp);
                    const network = data.network.replace(/[^a-z0-9-]/gi, "_");
                    downloadCSV(csv, `${network}_${date}_watchlist.csv`);
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

interface DiffDataWithScore extends DiffData {
  riskScore: number;
  riskLabel: string;
  riskColor: string;
}

function RunSelector({
  label,
  runs,
  selectedRunUid,
  onSelect,
  disabledRunUid,
  isOpen,
  onToggle,
}: {
  label: string;
  runs: RunManifestInfo[];
  selectedRunUid: string | null;
  onSelect: (runUid: string) => void;
  disabledRunUid?: string | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const selectedRun = runs.find((r) => r.runUid === selectedRunUid);
  const availableRuns = runs.filter((r) => r.runUid !== disabledRunUid);

  return (
    <div className="flex-1">
      <label className="text-sm font-medium text-muted-foreground mb-2 block">
        {label}
      </label>
      <div className="relative">
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={onToggle}
        >
          {selectedRun ? (
            <span className="truncate">
              {selectedRun.network} - {selectedRun.folderName}
            </span>
          ) : (
            <span className="text-muted-foreground">Select a run...</span>
          )}
          <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
        </Button>
        {isOpen && (
          <div className="absolute z-10 mt-1 w-full bg-background border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {availableRuns.length === 0 ? (
              <div className="px-4 py-2 text-sm text-muted-foreground">
                No other runs available
              </div>
            ) : (
              availableRuns.map((run) => (
                <button
                  key={run.runUid}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg"
                  onClick={() => {
                    onSelect(run.runUid);
                    onToggle();
                  }}
                >
                  <div className="font-medium">{run.network}</div>
                  <div className="text-xs text-muted-foreground">
                    {run.folderName}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiffPage() {
  const { isDemoMode, demoData } = useDemo();
  const router = useRouter();

  // State for runs and selection
  const [runs, setRuns] = useState<RunManifestInfo[]>([]);
  const [baselineRunUid, setBaselineRunUid] = useState<string | null>(null);
  const [currentRunUid, setCurrentRunUid] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<DiffDataWithScore | null>(null);

  // UI state
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBaselineSelector, setShowBaselineSelector] = useState(false);
  const [showCurrentSelector, setShowCurrentSelector] = useState(false);

  // Save comparison state
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // History state
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [history, setHistory] = useState<SavedComparison[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Backward compatibility: old links used /diff?comparison=<id>
  useEffect(() => {
    const comparisonId = new URLSearchParams(window.location.search).get("comparison");
    if (comparisonId) {
      router.replace(`/diff/${encodeURIComponent(comparisonId)}`);
    }
  }, [router]);

  // Load runs on mount
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

  // Auto-select latest two runs to reduce user effort
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

  async function handleCompare() {
    if (!baselineRunUid || !currentRunUid) return;

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

      if (result.success && result.data) {
        setDiffData(result.data);
      } else {
        setError(result.error || "Failed to compute diff");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compute diff");
    } finally {
      setIsComparing(false);
    }
  }

  async function handleSaveComparison() {
    if (!baselineRunUid || !currentRunUid) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineRunUid,
          currentRunUid,
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
                    onSelect={setBaselineRunUid}
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
                    onSelect={setCurrentRunUid}
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
                  {diffData && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Risk Score:</span>
                        <Badge
                          variant={diffData.riskScore > 50 ? "destructive" : diffData.riskScore > 25 ? "default" : "secondary"}
                        >
                          {diffData.riskScore}/100 - {diffData.riskLabel}
                        </Badge>
                      </div>

                      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Save Comparison</DialogTitle>
                            <DialogDescription>
                              Save this comparison with a shareable URL for later reference.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            {saveError && (
                              <div className="p-2 text-sm text-red-600 bg-red-50 rounded">
                                {saveError}
                              </div>
                            )}
                            <div>
                              <label className="text-sm font-medium">Title (optional)</label>
                              <input
                                type="text"
                                className="w-full mt-1 px-3 py-2 border rounded-md"
                                placeholder={`${diffData.network} comparison`}
                                value={saveTitle}
                                onChange={(e) => setSaveTitle(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Notes (optional)</label>
                              <textarea
                                className="w-full mt-1 px-3 py-2 border rounded-md"
                                rows={3}
                                placeholder="Add notes about this comparison..."
                                value={saveNotes}
                                onChange={(e) => setSaveNotes(e.target.value)}
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setIsSaveDialogOpen(false)}
                                disabled={isSaving}
                              >
                                Cancel
                              </Button>
                              <Button onClick={handleSaveComparison} disabled={isSaving}>
                                {isSaving ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  "Save Comparison"
                                )}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}

                  <Dialog
                    open={isHistoryDialogOpen}
                    onOpenChange={(open) => {
                      setIsHistoryDialogOpen(open);
                      if (open) loadHistory();
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <History className="h-4 w-4 mr-1" />
                        History
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Saved Comparisons</DialogTitle>
                        <DialogDescription>
                          View and load previously saved comparisons.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4 max-h-96 overflow-y-auto">
                        {isLoadingHistory ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : history.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No saved comparisons yet. Save a comparison to see it here.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {history.map((comp) => (
                              <div
                                key={comp.comparisonId}
                                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                              >
                                <a
                                  href={`/diff/${comp.comparisonId}`}
                                  className="flex-1"
                                >
                                  <div className="font-medium">
                                    {comp.title || `${comp.network} comparison`}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span>{comp.network}</span>
                                    <span>|</span>
                                    <span>{new Date(comp.createdAt).toLocaleDateString()}</span>
                                    <span>|</span>
                                    <Badge
                                      variant={comp.riskScore >= 70 ? "secondary" : comp.riskScore >= 50 ? "default" : "destructive"}
                                      className="text-xs"
                                    >
                                      {comp.riskScore}/100
                                    </Badge>
                                  </div>
                                </a>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteComparison(comp.comparisonId)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
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
      ) : !isComparing && !error && !isDemoMode && !displayData && (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>New Hosts</CardDescription>
                <CardTitle className="text-2xl">-</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Removed Hosts</CardDescription>
                <CardTitle className="text-2xl">-</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ports Opened</CardDescription>
                <CardTitle className="text-2xl">-</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ports Closed</CardDescription>
                <CardTitle className="text-2xl">-</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Risky Exposures</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  -
                  <Badge variant="destructive" className="text-xs">P0</Badge>
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="summary">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="hosts">Hosts</TabsTrigger>
                  <TabsTrigger value="ports">Ports</TabsTrigger>
                  <TabsTrigger value="risk">Risk Flags</TabsTrigger>
                  <TabsTrigger value="export">Export</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Select two runs above and click Compare to see results.
                  </p>
                </TabsContent>
                <TabsContent value="hosts" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    New and removed hosts will appear here.
                  </p>
                </TabsContent>
                <TabsContent value="ports" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Opened and closed ports will appear here.
                  </p>
                </TabsContent>
                <TabsContent value="risk" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    P0, P1, and P2 risk flags will appear here.
                  </p>
                </TabsContent>
                <TabsContent value="export" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Download CHANGES.md and WATCHLIST.md exports.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
