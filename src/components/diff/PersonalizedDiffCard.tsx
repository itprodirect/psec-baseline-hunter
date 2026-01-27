"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquareText, Loader2, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { DiffData } from "@/lib/types";
import { UserProfile } from "@/lib/types/userProfile";
import { DiffSummaryResponse } from "@/lib/llm/prompt-diff";
import { PersonalizedSummaryModal } from "@/components/scorecard/PersonalizedSummaryModal";
import { MarkdownViewer } from "@/components/scorecard/MarkdownViewer";

interface PersonalizedDiffCardProps {
  diffData: DiffData;
}

export function PersonalizedDiffCard({ diffData }: PersonalizedDiffCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [isRuleBased, setIsRuleBased] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateSummary = async (profile: UserProfile) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/llm/diff-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diffData,
          userProfile: profile,
        }),
      });

      const data: DiffSummaryResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to generate summary");
      }

      setSummary(data.summary || null);
      setProvider(data.provider || null);
      setIsRuleBased(data.isRuleBased || false);
      setIsModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSummary(null);
    setProvider(null);
    setIsRuleBased(false);
    setError(null);
  };

  // Initial state - show the "Explain" button
  if (!summary && !isLoading && !error) {
    return (
      <>
        <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <MessageSquareText className="h-5 w-5" />
              Personalized Change Report
            </CardTitle>
            <CardDescription>
              Get a plain-English explanation of what changed and why it matters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="gap-2"
              variant="outline"
            >
              <Sparkles className="h-4 w-4" />
              Explain These Changes
            </Button>
          </CardContent>
        </Card>

        <PersonalizedSummaryModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          onSubmit={handleGenerateSummary}
          isLoading={isLoading}
        />
      </>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className="border-purple-200 dark:border-purple-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <MessageSquareText className="h-5 w-5" />
            Personalized Change Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            <p className="text-sm text-muted-foreground">
              Analyzing changes and generating your report...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            Error Generating Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Success state - show the generated summary
  return (
    <Card className="border-purple-200 dark:border-purple-900">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <MessageSquareText className="h-5 w-5" />
              Your Change Report
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              {provider && (
                <Badge variant={isRuleBased ? "secondary" : "outline"} className="text-xs">
                  {isRuleBased ? "Rule-based" : provider}
                </Badge>
              )}
              {isRuleBased && (
                <span className="text-xs text-muted-foreground">
                  (No API key configured)
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {summary && (
          <MarkdownViewer
            content={summary}
            filename={`change-report-${diffData.network}-${new Date().toISOString().split("T")[0]}.md`}
          />
        )}
      </CardContent>

      <PersonalizedSummaryModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleGenerateSummary}
        isLoading={isLoading}
      />
    </Card>
  );
}
