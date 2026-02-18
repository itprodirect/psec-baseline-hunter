"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SavedComparison } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { History, Trash2, ExternalLink, Search, Clock, AlertCircle, Network, Copy, Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function HistoryPage() {
  const [comparisons, setComparisons] = useState<SavedComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadComparisons();
  }, []);

  async function loadComparisons() {
    try {
      setLoading(true);
      const response = await fetch("/api/comparisons");
      const data = await response.json();

      if (data.success) {
        setComparisons(data.comparisons || []);
      } else {
        setError(data.error || "Failed to load comparisons");
      }
    } catch (err) {
      setError("Failed to load comparisons");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(comparisonId: string) {
    if (!confirm("Are you sure you want to delete this comparison?")) return;

    try {
      const response = await fetch(`/api/comparisons/${comparisonId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setComparisons(comparisons.filter((c) => c.comparisonId !== comparisonId));
      } else {
        setError(data.error || "Failed to delete comparison");
      }
    } catch (err) {
      setError("Failed to delete comparison");
      console.error(err);
    }
  }

  function handleCopyLink(comparisonId: string) {
    const url = `${window.location.origin}/diff/${comparisonId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(comparisonId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatDate(timestamp: string): string {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getRiskBadgeVariant(
    riskLabel: string
  ): "default" | "destructive" | "secondary" {
    if (riskLabel === "Critical" || riskLabel === "Poor") return "destructive";
    if (riskLabel === "Fair") return "default";
    return "secondary";
  }

  // Filter comparisons by search term
  const filteredComparisons = comparisons.filter((c) =>
    c.network.toLowerCase().includes(search.toLowerCase()) ||
    c.title?.toLowerCase().includes(search.toLowerCase()) ||
    c.notes?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-muted-foreground">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="h-8 w-8" />
            Comparison History
          </h1>
          <p className="text-muted-foreground mt-1">
            Saved scan comparisons with shareable links
          </p>
        </div>
        <Link href="/diff">
          <Button variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            New Comparison
          </Button>
        </Link>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      {comparisons.length > 0 && (
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by network or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>
      )}

      {/* Empty State */}
      {comparisons.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Saved Comparisons</h3>
            <p className="text-muted-foreground mb-4">
              Save your scan comparisons to track changes over time
            </p>
            <Link href="/diff">
              <Button>
                <ExternalLink className="h-4 w-4 mr-2" />
                Create Comparison
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Saved Comparisons ({filteredComparisons.length})</CardTitle>
            <CardDescription>
              Click a comparison to view full details and analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredComparisons.map((comparison) => (
                <div
                  key={comparison.comparisonId}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Network className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{comparison.network}</span>
                      <Badge variant={getRiskBadgeVariant(comparison.riskLabel)}>
                        {comparison.riskLabel} ({comparison.riskScore})
                      </Badge>
                      {comparison.title && (
                        <span className="text-sm text-muted-foreground">
                          - {comparison.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(comparison.createdAt)}
                      </div>
                      <div>
                        {comparison.diffData.riskyExposures.length} risky exposure
                        {comparison.diffData.riskyExposures.length !== 1 ? "s" : ""}
                      </div>
                      <div>
                        {comparison.diffData.newHosts.length} new host
                        {comparison.diffData.newHosts.length !== 1 ? "s" : ""}
                      </div>
                      <div>
                        {comparison.diffData.portsOpened.length} port
                        {comparison.diffData.portsOpened.length !== 1 ? "s" : ""} opened
                      </div>
                    </div>
                    {comparison.notes && (
                      <p className="text-sm text-muted-foreground mt-2 italic">
                        &quot;{comparison.notes}&quot;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyLink(comparison.comparisonId)}
                    >
                      {copiedId === comparison.comparisonId ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Share
                        </>
                      )}
                    </Button>
                    <Link href={`/diff/${comparison.comparisonId}`}>
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(comparison.comparisonId)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      {comparisons.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Comparisons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{comparisons.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Networks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(comparisons.map((c) => c.network)).size}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Most Recent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {comparisons.length > 0 ? formatDate(comparisons[0].createdAt) : "N/A"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
