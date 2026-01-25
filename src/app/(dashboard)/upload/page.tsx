"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FolderSearch, RefreshCw } from "lucide-react";
import { Dropzone } from "@/components/upload/dropzone";
import { RunList } from "@/components/upload/run-list";
import { RunManifestInfo, UploadResponse, IngestResponseV2, RunsListResponseV2 } from "@/lib/types";

export default function UploadPage() {
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [uploadPath, setUploadPath] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunManifestInfo[]>([]);
  const [ingestStats, setIngestStats] = useState<{ newRuns: number; duplicateRuns: number } | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);

  // Load existing runs on mount
  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    setIsLoadingRuns(true);
    try {
      const response = await fetch("/api/runs");
      const data: RunsListResponseV2 = await response.json();
      if (data.success && data.runs) {
        setRuns(data.runs);
      }
    } catch (error) {
      console.error("Failed to load runs:", error);
    } finally {
      setIsLoadingRuns(false);
    }
  };

  const handleFileAccepted = useCallback(async (file: File) => {
    setUploadedFile({ name: file.name, size: file.size });
    setUploadError(null);
    setUploadPath(null);
    setIngestError(null);
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
      } else {
        setUploadPath(data.uploadPath || null);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleExtractAndDetect = async () => {
    if (!uploadPath) return;

    setIsIngesting(true);
    setIngestError(null);
    setIngestStats(null);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zipPath: uploadPath }),
      });

      const data: IngestResponseV2 = await response.json();

      if (!data.success) {
        setIngestError(data.error || "Extraction failed");
      } else if (data.runs) {
        // Store ingest stats for display
        setIngestStats({
          newRuns: data.newRuns || 0,
          duplicateRuns: data.duplicateRuns || 0,
        });

        // Add new runs to the list (use runUid for deduplication)
        setRuns((prev) => {
          const existingUids = new Set(prev.map((r) => r.runUid));
          const newRuns = data.runs!.filter((r) => !existingUids.has(r.runUid));
          return [...newRuns, ...prev];
        });
        // Clear uploaded file state after successful ingest
        setUploadedFile(null);
        setUploadPath(null);
      }
    } catch (error) {
      setIngestError(error instanceof Error ? error.message : "Extraction failed");
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload</h1>
        <p className="text-muted-foreground">
          Ingest baselinekit scan results for analysis
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Baseline ZIP
          </CardTitle>
          <CardDescription>
            Drag and drop a baselinekit ZIP file or click to browse
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Dropzone
            onFileAccepted={handleFileAccepted}
            isUploading={isUploading}
            uploadedFile={uploadedFile}
            error={uploadError}
          />

          {uploadPath && (
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">File uploaded successfully</p>
                <p className="text-xs text-muted-foreground">
                  Ready to extract and detect runs
                </p>
              </div>
              <Button
                onClick={handleExtractAndDetect}
                disabled={isIngesting}
              >
                {isIngesting ? (
                  <>
                    <FolderSearch className="mr-2 h-4 w-4 animate-pulse" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <FolderSearch className="mr-2 h-4 w-4" />
                    Extract + Detect
                  </>
                )}
              </Button>
            </div>
          )}

          {ingestError && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
              {ingestError}
            </div>
          )}

          {ingestStats && (
            <div className="p-4 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm">
              <p className="font-medium">Extraction complete!</p>
              <p>
                {ingestStats.newRuns > 0 && `${ingestStats.newRuns} new run${ingestStats.newRuns !== 1 ? "s" : ""} added`}
                {ingestStats.newRuns > 0 && ingestStats.duplicateRuns > 0 && ", "}
                {ingestStats.duplicateRuns > 0 && `${ingestStats.duplicateRuns} duplicate${ingestStats.duplicateRuns !== 1 ? "s" : ""} skipped`}
                {ingestStats.newRuns === 0 && ingestStats.duplicateRuns === 0 && "No runs found in ZIP"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Detected Runs</CardTitle>
              <CardDescription>
                Runs will appear here after uploading and processing
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadRuns}
              disabled={isLoadingRuns}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingRuns ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <RunList runs={runs} loading={isLoadingRuns} />
        </CardContent>
      </Card>
    </div>
  );
}
