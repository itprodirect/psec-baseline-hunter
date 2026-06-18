"use client";

/**
 * Upload panel for the Traffic Visualizer: a capture file (.pcap/.pcapng,
 * or a .json analysis export) plus an optional device inventory CSV.
 * Validation mirrors the server limits so feedback is instant.
 */

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AlertCircle, FileText, Loader2, Lock, Play, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  MAX_CAPTURE_BYTES,
  MAX_FIXTURE_BYTES,
} from "@/lib/services/capture-upload-safety";
import { formatTrafficBytes } from "@/lib/utils/traffic-format";

const MAX_CSV_BYTES = 1024 * 1024;

interface UploadPanelProps {
  onAnalyze: (capture: File, inventory: File | null) => void;
  onLoadDemo: () => void;
  isAnalyzing: boolean;
  serverError: string | null;
}

export function UploadPanel({ onAnalyze, onLoadDemo, isAnalyzing, serverError }: UploadPanelProps) {
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    const error = validateCapture(file);
    setLocalError(error);
    setCaptureFile(error ? null : file);
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: isAnalyzing,
  });

  const rejectionError =
    fileRejections.length > 0 ? "Please drop a single .pcap, .pcapng, or .json file." : null;
  const displayError = localError || rejectionError || serverError;

  const handleCsvChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setCsvFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setLocalError("The device list must be a .csv file.");
      setCsvFile(null);
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setLocalError("Device list CSV is too large (max 1 MB).");
      setCsvFile(null);
      return;
    }
    setLocalError(null);
    setCsvFile(file);
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div
          {...getRootProps()}
          className={cn(
            "flex h-36 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 bg-muted/40 hover:border-muted-foreground/50",
            isAnalyzing && "cursor-not-allowed opacity-70",
            displayError && "border-destructive/50"
          )}
        >
          <input {...getInputProps()} aria-label="Upload a packet capture file" />
          <div className="px-4 text-center">
            {isAnalyzing ? (
              <>
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                <p className="mt-2 text-sm font-medium">Analyzing traffic…</p>
              </>
            ) : captureFile ? (
              <>
                <FileText className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-2 text-sm font-medium">{captureFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTrafficBytes(captureFile.size)} — drop another file to replace
                </p>
              </>
            ) : (
              <>
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Drop a saved capture here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  .pcap or .pcapng (max {MAX_CAPTURE_BYTES / (1024 * 1024)} MB), or a .json analysis
                  exported by this tool
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">Known devices (optional CSV):</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvChange}
              disabled={isAnalyzing}
              className="max-w-56 text-xs file:mr-2 file:rounded-md file:border file:bg-muted file:px-2 file:py-1 file:text-xs"
              aria-label="Upload an optional device inventory CSV"
            />
            {csvFile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setCsvFile(null)}
                aria-label="Remove device list"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </label>
          <div className="flex gap-2">
            <Button
              onClick={() => captureFile && onAnalyze(captureFile, csvFile)}
              disabled={!captureFile || isAnalyzing}
            >
              {isAnalyzing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Analyze traffic
            </Button>
            <Button variant="outline" onClick={onLoadDemo} disabled={isAnalyzing}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Load 60-second sample
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Columns the CSV may include: Device, MAC Address, Vendor, IP Address, Hostnames, Status,
          Notes, Security Recs. Devices not on the list get flagged as unknown.
        </p>

        {displayError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{displayError}</span>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Privacy note:</strong> this app intentionally analyzes captures in memory and
            does not save the raw capture file. It reads traffic metadata - addresses, ports,
            timing, and looked-up names. Message, email, and page contents are not extracted for
            display.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function validateCapture(file: File): string | null {
  const lower = file.name.toLowerCase();
  const isCapture = lower.endsWith(".pcap") || lower.endsWith(".pcapng");
  const isFixture = lower.endsWith(".json");
  if (!isCapture && !isFixture) {
    return "Unsupported file type. Upload a .pcap or .pcapng capture, or a .json analysis exported by this tool.";
  }
  if (file.size === 0) return "That file is empty.";
  const max = isCapture ? MAX_CAPTURE_BYTES : MAX_FIXTURE_BYTES;
  if (file.size > max) {
    return `File is too large. Maximum is ${max / (1024 * 1024)} MB${isCapture ? " for captures in this version — try a shorter capture window" : ""}.`;
  }
  return null;
}
