"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Play,
  AlertTriangle,
  ChevronDown,
  Loader2,
  Server,
  FileText,
  Download,
  XCircle,
} from "lucide-react";
import { DiffView } from "@/components/diff/DiffView";
import { Dropzone } from "@/components/upload/dropzone";
import { useDemo } from "@/lib/context/demo-context";
import {
  RunManifestInfo,
  UploadResponse,
  IngestResponseV2,
  RunsListResponseV2,
  DiffData,
} from "@/lib/types";
import { diffToMarkdown } from "@/lib/utils/csv-export";

export default function DashboardPage() {
  // Demo mode
  const { isDemoMode, demoData, isLoadingDemo, loadDemoData, clearDemoData } = useDemo();

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Runs state
  const [runs, setRuns] = useState<RunManifestInfo[]>([]);

  // Selection state
  const [baselineRunUid, setBaselineRunUid] = useState<string | null>(null);
  const [currentRunUid, setCurrentRunUid] = useState<string | null>(null);
  const [showBaselineSelector, setShowBaselineSelector] = useState(false);
  const [showCurrentSelector, setShowCurrentSelector] = useState(false);

  // Results state
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const diffRequestGeneration = useRef(0);

  const loadRuns = useCallback(async () => {
    try {
      const response = await fetch("/api/runs");
      const data: RunsListResponseV2 = await response.json();
      if (data.success && data.runs) {
        setRuns(data.runs);
      }
    } catch (error) {
      console.error("Failed to load runs:", error);
    }
  }, []);

  // Load runs on mount
  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // Auto-select runs when available
  useEffect(() => {
    if (runs.length >= 2 && !baselineRunUid && !currentRunUid) {
      setCurrentRunUid(runs[0].runUid);
      setBaselineRunUid(runs[1].runUid);
    } else if (runs.length === 1 && !currentRunUid) {
      setCurrentRunUid(runs[0].runUid);
    }
  }, [runs, baselineRunUid, currentRunUid]);

  // Load diff when both runs are selected. Abort plus generation checks prevent a
  // late response from restoring evidence for a superseded selection.
  useEffect(() => {
    const generation = ++diffRequestGeneration.current;
    setDiffData(null);
    setDiffError(null);

    if (isDemoMode) {
      setIsLoadingDiff(false);
      return;
    }
    if (!baselineRunUid || !currentRunUid) {
      setIsLoadingDiff(false);
      return;
    }
    if (baselineRunUid === currentRunUid) {
      setDiffError("Select two different runs before comparing.");
      setIsLoadingDiff(false);
      return;
    }

    const controller = new AbortController();
    const isCurrentRequest = () => (
      !controller.signal.aborted && generation === diffRequestGeneration.current
    );

    async function loadDiff() {
      setIsLoadingDiff(true);
      try {
        const response = await fetch("/api/diff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baselineRunUid, currentRunUid }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!isCurrentRequest()) return;

        if (data.success && data.data) {
          setDiffData(data.data);
        } else {
          setDiffData(null);
          setDiffError(data.error || "Failed to compare runs");
        }
      } catch (error) {
        if (!isCurrentRequest()) return;
        setDiffData(null);
        setDiffError(error instanceof Error ? error.message : "Failed to compare runs");
      } finally {
        if (isCurrentRequest()) {
          setIsLoadingDiff(false);
        }
      }
    }

    loadDiff();
    return () => controller.abort();
  }, [baselineRunUid, currentRunUid, isDemoMode]);

  const handleExtract = useCallback(async (zipPath: string) => {
    setIsIngesting(true);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zipPath }),
      });

      const data: IngestResponseV2 = await response.json();

      if (data.success && data.runs && data.runs.length > 0) {
        // Refresh runs list
        await loadRuns();
        // Clear upload state
        setUploadedFile(null);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Extraction failed");
    } finally {
      setIsIngesting(false);
    }
  }, [loadRuns]);

  const handleFileAccepted = useCallback(async (file: File) => {
    setUploadedFile({ name: file.name, size: file.size });
    setUploadError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data: UploadResponse = await response.json();

      if (!data.success) {
        setUploadError(data.error || "Upload failed");
        setUploadedFile(null);
      } else if (data.uploadPath) {
        // Auto-extract after upload
        await handleExtract(data.uploadPath);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  }, [handleExtract]);

  const selectBaseline = (runUid: string) => {
    setDiffData(null);
    setDiffError(null);
    setBaselineRunUid(runUid);
    setShowBaselineSelector(false);
  };

  const selectCurrent = (runUid: string) => {
    setDiffData(null);
    setDiffError(null);
    setCurrentRunUid(runUid);
    setShowCurrentSelector(false);
  };

  // Use bounded demo data when in demo mode.
  const displayDiff = isDemoMode && demoData ? demoData.diff : diffData;

  const baselineRun = runs.find((r) => r.runUid === baselineRunUid);
  const currentRun = runs.find((r) => r.runUid === currentRunUid);

  const hasData = Boolean(displayDiff);
  const isLoading = isLoadingDiff || isIngesting || isUploading;

  const downloadReport = () => {
    if (!displayDiff) return;
    const blob = new Blob([diffToMarkdown(displayDiff)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "network-comparison.md";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Health Dashboard</h1>
          <p className="text-muted-foreground">
            Compare network observations within their verified evidence limits
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isDemoMode ? (
            <Button
              variant="outline"
              onClick={loadDemoData}
              disabled={isLoadingDemo}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              {isLoadingDemo ? "Loading..." : "Try Demo"}
            </Button>
          ) : (
            <Button variant="ghost" onClick={clearDemoData} className="gap-2">
              <XCircle className="h-4 w-4" />
              Exit Demo
            </Button>
          )}
        </div>
      </div>

      {/* Demo Mode Banner */}
      {isDemoMode && demoData && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Play className="h-5 w-5 text-blue-600" />
              <div>
                <span className="font-semibold text-blue-900 dark:text-blue-100">Demo Mode: </span>
                <span className="text-blue-700 dark:text-blue-300">
                  Viewing bounded sample observations from a home network. Baseline (Jan 15) vs Current (Jan 22).
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload + Run Selection Row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Upload Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Scan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Dropzone
              onFileAccepted={handleFileAccepted}
              isUploading={isUploading || isIngesting}
              uploadedFile={uploadedFile}
              error={uploadError}
              compact
            />
            <div className="mt-3 text-xs text-muted-foreground">
              <a href="/scripts/network-scan.ps1" download className="text-blue-600 hover:underline flex items-center gap-1">
                <Download className="h-3 w-3" />
                Download scan script (Windows)
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Baseline Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Baseline Scan</CardTitle>
            <CardDescription>The &ldquo;before&rdquo; observation</CardDescription>
          </CardHeader>
          <CardContent>
            {isDemoMode ? (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="font-medium">demo-network</div>
                <div className="text-xs text-muted-foreground">Jan 15, 2025 - Baseline</div>
              </div>
            ) : (
              <div className="relative">
                <Button
                  variant="outline"
                  className="w-full justify-between text-left"
                  onClick={() => {
                    setShowBaselineSelector(!showBaselineSelector);
                    setShowCurrentSelector(false);
                  }}
                  disabled={runs.length === 0}
                >
                  {baselineRun ? (
                    <span className="truncate">{baselineRun.folderName}</span>
                  ) : (
                    <span className="text-muted-foreground">Select baseline...</span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
                </Button>
                {showBaselineSelector && runs.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {runs.map((run) => (
                      <button
                        key={run.runUid}
                        type="button"
                        disabled={run.runUid === currentRunUid}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => selectBaseline(run.runUid)}
                      >
                        <div className="font-medium truncate">{run.folderName}</div>
                        <div className="text-xs text-muted-foreground">{run.network}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Current Scan</CardTitle>
            <CardDescription>The &ldquo;after&rdquo; observation</CardDescription>
          </CardHeader>
          <CardContent>
            {isDemoMode ? (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="font-medium">demo-network</div>
                <div className="text-xs text-muted-foreground">Jan 22, 2025 - Current</div>
              </div>
            ) : (
              <div className="relative">
                <Button
                  variant="outline"
                  className="w-full justify-between text-left"
                  onClick={() => {
                    setShowCurrentSelector(!showCurrentSelector);
                    setShowBaselineSelector(false);
                  }}
                  disabled={runs.length === 0}
                >
                  {currentRun ? (
                    <span className="truncate">{currentRun.folderName}</span>
                  ) : (
                    <span className="text-muted-foreground">Select current...</span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
                </Button>
                {showCurrentSelector && runs.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {runs.map((run) => (
                      <button
                        key={run.runUid}
                        type="button"
                        disabled={run.runUid === baselineRunUid}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => selectCurrent(run.runUid)}
                      >
                        <div className="font-medium truncate">{run.folderName}</div>
                        <div className="text-xs text-muted-foreground">{run.network}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>
                {isIngesting ? "Processing scan..." : isUploading ? "Uploading..." : "Comparing scans..."}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {diffError && !isDemoMode && (
        <Card className="border-red-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>{diffError}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence-aware comparison results */}
      {hasData && !isLoading && displayDiff && (
        <DiffView
          data={displayDiff}
          exportSection={(
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The report includes the evidence status, coverage, identity, vantage, and limitations.
              </p>
              <Button variant="outline" className="gap-2" onClick={downloadReport}>
                <FileText className="h-4 w-4" />
                Export Comparison Report
              </Button>
            </div>
          )}
        />
      )}

      {/* Empty State */}
      {!hasData && !isLoading && !diffError && !isDemoMode && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Scan Data Yet</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Upload a network scan ZIP to compare observations, or try the bounded demo to see how it works.
              </p>
              <div className="flex justify-center gap-3">
                <Button onClick={loadDemoData} disabled={isLoadingDemo} className="gap-2">
                  <Play className="h-4 w-4" />
                  Try Demo
                </Button>
                <Button variant="outline" asChild>
                  <a href="/scripts/network-scan.ps1" download className="gap-2">
                    <Download className="h-4 w-4" />
                    Get Scan Script
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
