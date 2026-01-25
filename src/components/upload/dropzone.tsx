"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileArchive, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  onFileAccepted: (file: File) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadedFile?: { name: string; size: number } | null;
  error?: string | null;
}

export function Dropzone({
  onFileAccepted,
  isUploading = false,
  uploadProgress = 0,
  uploadedFile = null,
  error = null,
}: DropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileAccepted(acceptedFiles[0]);
      }
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
    },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024, // 500MB
    disabled: isUploading,
  });

  const rejectionError = fileRejections.length > 0
    ? fileRejections[0].errors[0]?.message
    : null;
  const displayError = error || rejectionError;

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex h-64 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-colors",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 bg-muted/50 hover:border-muted-foreground/50",
        isUploading && "cursor-not-allowed opacity-75",
        displayError && "border-destructive/50 bg-destructive/5"
      )}
    >
      <input {...getInputProps()} />

      <div className="text-center p-6">
        {isUploading ? (
          <>
            <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
            <p className="mt-2 text-sm font-medium">
              Uploading... {uploadProgress > 0 && `${uploadProgress}%`}
            </p>
            {uploadedFile && (
              <p className="text-xs text-muted-foreground mt-1">
                {uploadedFile.name}
              </p>
            )}
          </>
        ) : uploadedFile && !displayError ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <p className="mt-2 text-sm font-medium text-green-600">
              File ready for processing
            </p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <FileArchive className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {uploadedFile.name} ({formatFileSize(uploadedFile.size)})
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Drop a new file to replace
            </p>
          </>
        ) : displayError ? (
          <>
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <p className="mt-2 text-sm font-medium text-destructive">
              Upload failed
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {displayError}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Click or drop to try again
            </p>
          </>
        ) : (
          <>
            <Upload
              className={cn(
                "mx-auto h-12 w-12",
                isDragActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              {isDragActive
                ? "Drop ZIP file here..."
                : "Drop ZIP file here or click to upload"}
            </p>
            <p className="text-xs text-muted-foreground">
              Supports baselinekit scan exports (max 500MB)
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
