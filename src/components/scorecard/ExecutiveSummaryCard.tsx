"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Loader2, Sparkles, AlertCircle, RefreshCw, Building2 } from "lucide-react";
import { ScorecardData, ExecutiveSummaryResponse } from "@/lib/types";
import { usePersona } from "@/lib/context/persona-context";
import { PersonalizedSummaryModal } from "./PersonalizedSummaryModal";
import { MarkdownViewer } from "./MarkdownViewer";

interface ExecutiveSummaryCardProps {
  scorecardData: ScorecardData;
}

export function ExecutiveSummaryCard({ scorecardData }: ExecutiveSummaryCardProps) {
  const { profile } = usePersona();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [isRuleBased, setIsRuleBased] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateClick = () => {
    if (!profile) {
      // No profile - open profile modal
      setIsProfileModalOpen(true);
    } else {
      // Have profile - generate immediately
      generateSummary();
    }
  };

  const handleProfileSubmit = async () => {
    setIsProfileModalOpen(false);
    // Profile was just saved via PersonalizedSummaryModal
    // Now generate summary
    await generateSummary();
  };

  const generateSummary = async () => {
    if (!profile) {
      setError("Profile is required. Please configure your profile first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSummary(null);

    try {
      const response = await fetch("/api/llm/executive-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scorecardData,
          userProfile: profile,
        }),
      });

      const data: ExecutiveSummaryResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to generate executive summary");
      }

      setSummary(data.summary || null);
      setProvider(data.provider || null);
      setIsRuleBased(data.isRuleBased || false);
      setIsSummaryModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate executive summary");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = () => {
    setSummary(null);
    setProvider(null);
    setIsRuleBased(false);
    setError(null);
    setIsSummaryModalOpen(false);
    generateSummary();
  };

  const handleReset = () => {
    setSummary(null);
    setProvider(null);
    setIsRuleBased(false);
    setError(null);
    setIsSummaryModalOpen(false);
  };

  // Generate filename for export
  const exportFilename = `executive-summary-${scorecardData.network}-${new Date(scorecardData.timestamp).toISOString().split("T")[0]}.md`;

  return (
    <>
      {/* Main Card */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Building2 className="h-5 w-5" />
            Executive Summary
          </CardTitle>
          <CardDescription>
            Get a business-focused report for leadership with financial impact and action plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Generate Button */}
            <Button
              onClick={handleGenerateClick}
              disabled={isLoading}
              className="gap-2"
              variant="outline"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Generate Executive Summary
                </>
              )}
            </Button>

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                    Failed to generate summary
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateClick}
                    className="mt-2"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {/* Info Text */}
            {!profile && (
              <p className="text-xs text-muted-foreground">
                Requires your profile to tailor the report to your industry and role.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profile Modal */}
      <PersonalizedSummaryModal
        open={isProfileModalOpen}
        onOpenChange={setIsProfileModalOpen}
        onSubmit={handleProfileSubmit}
        isLoading={false}
      />

      {/* Summary Display Modal */}
      <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Executive Summary
              {isRuleBased && (
                <Badge variant="outline" className="ml-2">
                  Rule-Based
                </Badge>
              )}
              {provider && !isRuleBased && (
                <Badge variant="secondary" className="ml-2">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {provider}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {scorecardData.network} - {new Date(scorecardData.timestamp).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>

          {summary && (
            <div className="space-y-4">
              <MarkdownViewer content={summary} filename={exportFilename} />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Regenerate
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
