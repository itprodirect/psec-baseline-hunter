"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Play,
  Shield,
  AlertTriangle,
  Plus,
  Minus,
  ChevronDown,
  Loader2,
  Server,
  Network,
  FileText,
  Download,
  CheckCircle,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { Dropzone } from "@/components/upload/dropzone";
import { useDemo } from "@/lib/context/demo-context";
import {
  RunManifestInfo,
  UploadResponse,
  IngestResponseV2,
  RunsListResponseV2,
  DiffData,
  PortChange,
  HostChange,
} from "@/lib/types";

// Risk score display component
function RiskScoreCard({ score, label, color }: { score: number; label: string; color: string }) {
  const colorClasses: Record<string, string> = {
    green: "text-green-600 bg-green-100 dark:bg-green-900/30",
    blue: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
    yellow: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30",
    orange: "text-orange-600 bg-orange-100 dark:bg-orange-900/30",
    red: "text-red-600 bg-red-100 dark:bg-red-900/30",
  };

  return (
    <Card className={`border-2 ${color === "red" ? "border-red-300" : color === "green" ? "border-green-300" : "border-gray-200"}`}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Risk Score
        </CardDescription>
        <div className="flex items-center gap-3">
          <CardTitle className="text-5xl font-bold">{score}</CardTitle>
          <Badge className={colorClasses[color] || colorClasses.blue}>
            {label}
          </Badge>
        </div>
      </CardHeader>
    </Card>
  );
}

// Summary metric card
function MetricCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantClasses = {
    default: "",
    success: "border-green-200 dark:border-green-900",
    warning: "border-yellow-200 dark:border-yellow-900",
    danger: "border-red-200 dark:border-red-900",
  };

  return (
    <Card className={variantClasses[variant]}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

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
  const [riskScore, setRiskScore] = useState<number>(100);
  const [riskLabel, setRiskLabel] = useState<string>("Excellent");
  const [riskColor, setRiskColor] = useState<string>("green");
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

  const loadDiff = useCallback(async () => {
    if (!baselineRunUid || !currentRunUid) return;

    setIsLoadingDiff(true);
    setDiffError(null);

    try {
      const response = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineRunUid, currentRunUid }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        setDiffData(data.data);
        setRiskScore(data.data.riskScore);
        setRiskLabel(data.data.riskLabel);
        setRiskColor(data.data.riskColor);
      } else {
        setDiffError(data.error || "Failed to compare runs");
      }
    } catch (error) {
      setDiffError(error instanceof Error ? error.message : "Failed to compare runs");
    } finally {
      setIsLoadingDiff(false);
    }
  }, [baselineRunUid, currentRunUid]);

  // Load diff when both runs are selected
  useEffect(() => {
    if (baselineRunUid && currentRunUid && !isDemoMode) {
      loadDiff();
    }
  }, [baselineRunUid, currentRunUid, isDemoMode, loadDiff]);

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

  // Use demo data when in demo mode
  const displayDiff = isDemoMode && demoData ? demoData.diff : diffData;
  const displayRiskScore = isDemoMode && demoData ? 55 : riskScore; // Demo shows concerning score
  const displayRiskLabel = isDemoMode && demoData ? "Fair" : riskLabel;
  const displayRiskColor = isDemoMode && demoData ? "yellow" : riskColor;

  const baselineRun = runs.find((r) => r.runUid === baselineRunUid);
  const currentRun = runs.find((r) => r.runUid === currentRunUid);

  const hasData = displayDiff || (isDemoMode && demoData);
  const isLoading = isLoadingDiff || isIngesting || isUploading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Health Dashboard</h1>
          <p className="text-muted-foreground">
            Compare scans to detect changes and security risks
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
                  Viewing sample data from a home network. Baseline (Jan 15) vs Current (Jan 22).
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
            <CardDescription>The &ldquo;before&rdquo; snapshot</CardDescription>
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
                  onClick={() => setShowBaselineSelector(!showBaselineSelector)}
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
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setBaselineRunUid(run.runUid);
                          setShowBaselineSelector(false);
                        }}
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
            <CardDescription>The &ldquo;after&rdquo; snapshot</CardDescription>
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
                  onClick={() => setShowCurrentSelector(!showCurrentSelector)}
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
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setCurrentRunUid(run.runUid);
                          setShowCurrentSelector(false);
                        }}
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

      {/* Results Section */}
      {hasData && !isLoading && (
        <>
          {/* Summary Banner */}
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                <p className="text-amber-800 dark:text-amber-200">
                  {displayDiff?.summary}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-6">
            <RiskScoreCard score={displayRiskScore} label={displayRiskLabel} color={displayRiskColor} />
            <MetricCard
              label="New Devices"
              value={displayDiff?.newHosts.length || 0}
              icon={Plus}
              variant={displayDiff?.newHosts.length ? "warning" : "default"}
            />
            <MetricCard
              label="Missing Devices"
              value={displayDiff?.removedHosts.length || 0}
              icon={Minus}
              variant={displayDiff?.removedHosts.length ? "warning" : "default"}
            />
            <MetricCard
              label="Ports Opened"
              value={displayDiff?.portsOpened.length || 0}
              icon={Network}
              variant={displayDiff?.portsOpened.length ? "warning" : "default"}
            />
            <MetricCard
              label="Ports Closed"
              value={displayDiff?.portsClosed.length || 0}
              icon={XCircle}
            />
            <MetricCard
              label="High-Risk"
              value={displayDiff?.riskyExposures.length || 0}
              icon={AlertTriangle}
              variant={displayDiff?.riskyExposures.length ? "danger" : "default"}
            />
          </div>

          {/* Detailed Tables */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="devices">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="devices">Devices</TabsTrigger>
                  <TabsTrigger value="ports">Ports</TabsTrigger>
                  <TabsTrigger value="risks">High-Risk</TabsTrigger>
                  <TabsTrigger value="actions">Actions</TabsTrigger>
                </TabsList>

                {/* Devices Tab */}
                <TabsContent value="devices" className="mt-4 space-y-4">
                  {displayDiff?.newHosts.length ? (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-green-700">
                        <Plus className="h-4 w-4" />
                        New Devices ({displayDiff.newHosts.length})
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left py-2 px-4">IP Address</th>
                              <th className="text-left py-2 px-4">Hostname</th>
                              <th className="text-left py-2 px-4">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayDiff.newHosts.map((h: HostChange, i: number) => (
                              <tr key={i} className="border-t">
                                <td className="py-2 px-4 font-mono">{h.ip}</td>
                                <td className="py-2 px-4">{h.hostname || "—"}</td>
                                <td className="py-2 px-4">
                                  <Badge variant="outline" className="gap-1">
                                    <HelpCircle className="h-3 w-3" />
                                    Unknown
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {displayDiff?.removedHosts.length ? (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-gray-600">
                        <Minus className="h-4 w-4" />
                        Missing Devices ({displayDiff.removedHosts.length})
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left py-2 px-4">IP Address</th>
                              <th className="text-left py-2 px-4">Hostname</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayDiff.removedHosts.map((h: HostChange, i: number) => (
                              <tr key={i} className="border-t text-muted-foreground">
                                <td className="py-2 px-4 font-mono line-through">{h.ip}</td>
                                <td className="py-2 px-4 line-through">{h.hostname || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {!displayDiff?.newHosts.length && !displayDiff?.removedHosts.length && (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>No device changes detected</p>
                    </div>
                  )}
                </TabsContent>

                {/* Ports Tab */}
                <TabsContent value="ports" className="mt-4 space-y-4">
                  {displayDiff?.portsOpened.length ? (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-yellow-700">
                        <Plus className="h-4 w-4" />
                        Ports Opened ({displayDiff.portsOpened.length})
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left py-2 px-4">Device</th>
                              <th className="text-left py-2 px-4">Port</th>
                              <th className="text-left py-2 px-4">Service</th>
                              <th className="text-left py-2 px-4">Risk</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayDiff.portsOpened.map((p: PortChange, i: number) => (
                              <tr key={i} className={`border-t ${p.risk === "P0" ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                                <td className="py-2 px-4">
                                  <span className="font-mono">{p.ip}</span>
                                  {p.hostname && <span className="text-muted-foreground ml-1">({p.hostname})</span>}
                                </td>
                                <td className="py-2 px-4 font-mono">{p.port}/{p.protocol}</td>
                                <td className="py-2 px-4">{p.service || "unknown"}</td>
                                <td className="py-2 px-4">
                                  {p.risk && (
                                    <Badge variant={p.risk === "P0" ? "destructive" : p.risk === "P1" ? "default" : "secondary"}>
                                      {p.risk}
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {displayDiff?.portsClosed.length ? (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-gray-600">
                        <Minus className="h-4 w-4" />
                        Ports Closed ({displayDiff.portsClosed.length})
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left py-2 px-4">Device</th>
                              <th className="text-left py-2 px-4">Port</th>
                              <th className="text-left py-2 px-4">Service</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayDiff.portsClosed.map((p: PortChange, i: number) => (
                              <tr key={i} className="border-t text-muted-foreground">
                                <td className="py-2 px-4 font-mono line-through">{p.ip}</td>
                                <td className="py-2 px-4 font-mono line-through">{p.port}/{p.protocol}</td>
                                <td className="py-2 px-4 line-through">{p.service}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {!displayDiff?.portsOpened.length && !displayDiff?.portsClosed.length && (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>No port changes detected</p>
                    </div>
                  )}
                </TabsContent>

                {/* Risks Tab */}
                <TabsContent value="risks" className="mt-4">
                  {displayDiff?.riskyExposures.length ? (
                    <div className="space-y-3">
                      {displayDiff.riskyExposures.map((p: PortChange, i: number) => (
                        <div key={i} className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <span className="font-semibold text-red-700 dark:text-red-400">
                                  {p.service || `Port ${p.port}`} exposed
                                </span>
                                <Badge variant="destructive">P0</Badge>
                              </div>
                              <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                                {p.ip} ({p.hostname || "unknown"}) - Port {p.port}/{p.protocol}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p className="text-green-700 font-medium">No critical exposures detected</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        No new P0 (critical) security risks found in this comparison.
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Actions Tab */}
                <TabsContent value="actions" className="mt-4">
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                      <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-3">
                        Recommended Actions
                      </h4>
                      <ol className="space-y-2 text-sm list-decimal list-inside text-amber-700 dark:text-amber-300">
                        {displayDiff?.riskyExposures.length ? (
                          <>
                            <li>Block or restrict access to newly exposed critical ports (RDP, SMB)</li>
                            <li>Investigate new devices and add known ones to inventory</li>
                            <li>Review firewall rules and network segmentation</li>
                          </>
                        ) : (
                          <>
                            <li>Continue regular baseline scans to monitor for changes</li>
                            <li>Update device inventory with any new devices found</li>
                            <li>Document any intentional changes in your security log</li>
                          </>
                        )}
                      </ol>
                    </div>

                    <div className="flex gap-3">
                      <Button variant="outline" className="gap-2" onClick={() => {
                        if (!displayDiff) return;
                        const content = `# Network Changes Report\n\nGenerated: ${new Date().toISOString()}\n\n## Summary\n${displayDiff.summary}\n\n## New Devices\n${displayDiff.newHosts.map(h => `- ${h.ip} (${h.hostname || "unknown"})`).join("\n") || "None"}\n\n## Ports Opened\n${displayDiff.portsOpened.map(p => `- ${p.ip}:${p.port}/${p.protocol} (${p.service})${p.risk ? ` [${p.risk}]` : ""}`).join("\n") || "None"}`;
                        const blob = new Blob([content], { type: "text/markdown" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "network-changes.md";
                        a.click();
                      }}>
                        <FileText className="h-4 w-4" />
                        Export Report
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {!hasData && !isLoading && !isDemoMode && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Scan Data Yet</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Upload a network scan ZIP to get started, or try the demo to see how it works.
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
