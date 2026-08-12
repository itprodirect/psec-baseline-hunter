"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Link as LinkIcon,
  Clock,
} from "lucide-react";
import { SavedComparison, ComparisonResponse } from "@/lib/types";
import { diffToCSV, reviewListToCSV, downloadCSV, formatDateForFilename } from "@/lib/utils/csv-export";
import { DiffView } from "@/components/diff/DiffView";

export default function SavedComparisonPage({
  params,
}: {
  params: Promise<{ comparisonId: string }>;
}) {
  const { comparisonId } = use(params);
  const router = useRouter();
  const [comparison, setComparison] = useState<SavedComparison | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const comparisonRequest = useRef(0);

  useEffect(() => {
    const requestId = ++comparisonRequest.current;
    const controller = new AbortController();
    async function loadComparison() {
      setIsLoading(true);
      setError(null);
      setComparison(null);

      try {
        const response = await fetch(`/api/comparisons/${comparisonId}`, {
          signal: controller.signal,
        });
        const data: ComparisonResponse = await response.json();
        if (controller.signal.aborted || requestId !== comparisonRequest.current) return;

        if (
          data.success &&
          data.comparison &&
          data.comparison.comparisonId === comparisonId
        ) {
          setComparison(data.comparison);
        } else {
          setComparison(null);
          setError(data.error || "Comparison not found");
        }
      } catch (err) {
        if (controller.signal.aborted || requestId !== comparisonRequest.current) return;
        setComparison(null);
        setError(err instanceof Error ? err.message : "Failed to load comparison");
      } finally {
        if (requestId === comparisonRequest.current) {
          setIsLoading(false);
        }
      }
    }

    loadComparison();
    return () => {
      comparisonRequest.current += 1;
      controller.abort();
    };
  }, [comparisonId]);

  function copyShareableUrl() {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          {error || "Comparison not found"}
        </div>
        <Button variant="outline" onClick={() => router.push("/diff")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Changes
        </Button>
      </div>
    );
  }

  const data = comparison.diffData;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" onClick={() => router.push("/diff")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {comparison.title || "Saved Comparison"}
          </h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Clock className="h-4 w-4" />
            Saved {new Date(comparison.createdAt).toLocaleDateString()}
            <span className="mx-2">|</span>
            Network: {comparison.network}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data.evidence.status === "supported" ? "secondary" : "outline"}>
            Evidence: {data.evidence.status}
          </Badge>
          <Button variant="outline" size="sm" onClick={copyShareableUrl}>
            <LinkIcon className="h-4 w-4 mr-1" />
            {copied ? "Copied!" : "Copy Link"}
          </Button>
        </div>
      </div>

      {comparison.notes && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{comparison.notes}</p>
          </CardContent>
        </Card>
      )}

      <DiffView
        data={data}
        exportSection={(
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Every export includes the evidence status, coverage, identity, vantage, and limitations.
            </p>

            <div>
              <h4 className="text-sm font-medium mb-2">CSV Exports</h4>
              <div className="flex gap-4">
                <button
                  className="px-4 py-2 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg text-sm font-medium transition-colors"
                  onClick={() => {
                    const csv = diffToCSV(data);
                    const date = formatDateForFilename(data.currentTimestamp);
                    const network = data.network.replace(/[^a-z0-9-]/gi, "_");
                    downloadCSV(csv, `${network}_${date}_changes.csv`);
                  }}
                >
                  Download All Changes (CSV)
                </button>
                {data.riskFindings.length > 0 && (
                  <button
                    className="px-4 py-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium transition-colors"
                    onClick={() => {
                      const csv = reviewListToCSV(data.riskFindings, data.evidence);
                      const date = formatDateForFilename(data.currentTimestamp);
                      const network = data.network.replace(/[^a-z0-9-]/gi, "_");
                      downloadCSV(csv, `${network}_${date}_review-list.csv`);
                    }}
                  >
                    Download Review List (CSV)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
}
