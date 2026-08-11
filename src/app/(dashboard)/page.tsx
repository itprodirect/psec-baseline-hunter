"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Play,
  Server,
  Upload,
  XCircle,
} from "lucide-react";
import { DiffView } from "@/components/diff/DiffView";
import { Dropzone } from "@/components/upload/dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDemo } from "@/lib/context/demo-context";
import type {
  DiffData,
  IngestResponseV2,
  RunManifestInfo,
  RunsListResponseV2,
  UploadResponse,
} from "@/lib/types";
import { diffToMarkdown } from "@/lib/utils/csv-export";

interface RunPickerProps {
  title: string;
  description: string;
  demoLabel: string;
  isDemoMode: boolean;
  runs: RunManifestInfo[];
  selectedRun: RunManifestInfo | undefined;
  disabledRunUid: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (runUid: string) => void;
}

function RunPicker({
  title,
  description,
  demoLabel,
  isDemoMode,
  runs,
  selectedRun,
  disabledRunUid,
  isOpen,
  onToggle,
  onSelect,
}: RunPickerProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isDemoMode ? (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="font-medium">demo-network</div>
            <div className="text-xs text-muted-foreground">{demoLabel}</div>
          </div>
        ) : (
          <div className="relative">
            <Button
              variant="outline"
              className="w-full justify-between text-left"
              onClick={onToggle}
              disabled={runs.length === 0}
            >
              {selectedRun ? (
                <span className="truncate">{selectedRun.folderName}</span>
              ) : (
                <span className="text-muted-foreground">Select run...</span>
              )}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
            </Button>
            {isOpen && runs.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-background shadow-lg">
                {runs.map((run) => (
                  <button
                    key={run.runUid}
                    type="button"
                    disabled={run.runUid === disabledRunUid}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => onSelect(run.runUid)}
                  >
                    <div className="truncate font-medium">{run.folderName}</div>
                    <div className="text-xs text-muted-foreground">{run.network}</div>
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

export default function DashboardPage() {
  const { isDemoMode, demoData, isLoadingDemo, loadDemoData, clearDemoData } = useDemo();

  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunManifestInfo[]>([]);
  const [baselineRunUid, setBaselineRunUid] = useState<string | null>(null);
  const [currentRunUid, setCurrentRunUid] = useState<string | null>(null);
  const [showBaselineSelector, setShowBaselineSelector] = useState(false);
  const [showCurrentSelector, setShowCurrentSelector] = useState(false);
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

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

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (runs.length >= 2 && !baselineRunUid && !currentRunUid) {
      setCurrentRunUid(runs[0].runUid);
      setBaselineRunUid(runs[1].runUid);
    } else if (runs.length === 1 && !currentRunUid) {
      setCurrentRunUid(runs[0].runUid);
    }
  }, [runs, baselineRunUid, currentRunUid]);

  useEffect(() => {
    if (isDemoMode) return;

    setDiffData(null);
    setDiffError(null);

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
        if (controller.signal.aborted) return;

        if (data.success && data.data) {
          setDiffData(data.data);
        } else {
          setDiffData(null);
          setDiffError(data.error || "Failed to compare runs");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setDiffData(null);
        setDiffError(error instanceof Error ? error.message : "Failed to compare runs");
      } finally {
        if (!controller.signal.aborted) {
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
        await loadRuns();
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
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data: UploadResponse = await response.json();
      if (!data.success) {
        setUploadError(data.error || "Upload failed");
        setUploadedFile(null);
      } else if (data.uploadPath) {
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

  const displayDiff = isDemoMode && demoData ? demoData.diff : diffData;
  const baselineRun = runs.find((run) => run.runUid === baselineRunUid);
  const currentRun = runs.find((run) => run.runUid === currentRunUid);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Observation Dashboard</h1>
          <p className="text-muted-foreground">Compare scans with explicit evidence boundaries.</p>
        </div>
        {!isDemoMode ? (
          <Button variant="outline" onClick={loadDemoData} disabled={isLoadingDemo} className="gap-2">
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

      {isDemoMode && demoData && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Play className="h-5 w-5 text-blue-600" />
              <p className="text-blue-700 dark:text-blue-300">
                <span className="font-semibold text-blue-900 dark:text-blue-100">Demo Mode: </span>
                Viewing bounded sample observations from Jan 15 and Jan 22.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
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
              <a href="/scripts/network-scan.ps1" download className="flex items-center gap-1 text-blue-600 hover:underline">
                <Download className="h-3 w-3" />
                Download scan script (Windows)
              </a>
            </div>
          </CardContent>
        </Card>

        <RunPicker
          title="Baseline Scan"
          description="The earlier observation"
          demoLabel="Jan 15, 2025 - Baseline"
          isDemoMode={isDemoMode}
          runs={runs}
          selectedRun={baselineRun}
          disabledRunUid={currentRunUid}
          isOpen={showBaselineSelector}
          onToggle={() => {
            setShowBaselineSelector((open) => !open);
            setShowCurrentSelector(false);
          }}
          onSelect={selectBaseline}
        />

        <RunPicker
          title="Current Scan"
          description="The later observation"
          demoLabel="Jan 22, 2025 - Current"
          isDemoMode={isDemoMode}
          runs={runs}
          selectedRun={currentRun}
          disabledRunUid={baselineRunUid}
          isOpen={showCurrentSelector}
          onToggle={() => {
            setShowCurrentSelector((open) => !open);
            setShowBaselineSelector(false);
          }}
          onSelect={selectCurrent}
        />
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>{isIngesting ? "Processing scan..." : isUploading ? "Uploading..." : "Comparing scans..."}</span>
            </div>
          </CardContent>
        </Card>
      )}

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

      {displayDiff && !isLoading && (
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

      {!displayDiff && !isLoading && !diffError && !isDemoMode && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Server className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No Comparison Result</h3>
              <p className="mx-auto mb-4 max-w-md text-muted-foreground">
                Select two observations or upload scan data to request a comparison.
              </p>
              <Button onClick={loadDemoData} disabled={isLoadingDemo} className="gap-2">
                <Play className="h-4 w-4" />
                {isLoadingDemo ? "Loading Demo..." : "Try Demo Data"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
