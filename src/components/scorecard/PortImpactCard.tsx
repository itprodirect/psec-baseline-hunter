"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  DollarSign,
  Clock,
  Scale,
  Shield,
  Newspaper,
  AlertCircle
} from "lucide-react";
import { RiskPort, PortImpactData, PortImpactResponse } from "@/lib/types";
import { getCachedImpact, cacheImpact } from "@/lib/services/impact-cache";

interface PortImpactCardProps {
  riskPort: RiskPort;
}

export function PortImpactCard({ riskPort }: PortImpactCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [impact, setImpact] = useState<PortImpactData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  // Check cache on mount
  useEffect(() => {
    const cached = getCachedImpact(riskPort.port, riskPort.protocol, riskPort.service);
    if (cached) {
      setImpact(cached);
      setIsCached(true);
    }
  }, [riskPort.port, riskPort.protocol, riskPort.service]);

  const handleToggle = async () => {
    if (!isExpanded && !impact) {
      // Expanding for the first time - fetch data
      await fetchImpactData();
    }
    setIsExpanded(!isExpanded);
  };

  const fetchImpactData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/llm/port-impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: riskPort.port,
          protocol: riskPort.protocol,
          service: riskPort.service,
        }),
      });

      const data: PortImpactResponse = await response.json();

      if (!data.success || !data.impact) {
        throw new Error(data.error || "Failed to load impact data");
      }

      setImpact(data.impact);
      setIsCached(false);

      // Cache for future use
      cacheImpact(riskPort.port, riskPort.protocol, riskPort.service, data.impact);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load impact data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    setError(null);
    await fetchImpactData();
    setIsExpanded(true);
  };

  // Don't render button if already have cached data and expanded
  const showToggleButton = !impact || !isExpanded;

  return (
    <div className="space-y-2">
      {/* Toggle Button */}
      {showToggleButton && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          disabled={isLoading}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading real-world impact...
            </>
          ) : isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide Real-World Impact
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Show Real-World Impact
              {isCached && <Badge variant="outline" className="ml-auto">Cached</Badge>}
            </>
          )}
        </Button>
      )}

      {/* Error State */}
      {error && (
        <Card className="p-4 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                Failed to load impact data
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Expanded Content */}
      {isExpanded && impact && !error && (
        <Card className="p-4 bg-orange-50 dark:bg-orange-950/10 border-orange-200 dark:border-orange-900">
          <div className="space-y-4">
            {/* Header with Severity */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Real-World Impact
              </h4>
              <Badge
                variant={impact.severity === "Critical" ? "destructive" : "default"}
                className={impact.severity === "Critical" ? "" : "bg-orange-500"}
              >
                {impact.severity}
              </Badge>
            </div>

            {/* Attack Scenario */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-orange-800 dark:text-orange-300 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                How This Gets Exploited:
              </p>
              <p className="text-sm text-orange-900 dark:text-orange-100">
                {impact.attackScenario}
              </p>
            </div>

            {/* Breach Examples */}
            {impact.breachExamples && impact.breachExamples.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-orange-800 dark:text-orange-300 flex items-center gap-1">
                  <Newspaper className="h-3 w-3" />
                  Recent Incidents:
                </p>
                <div className="space-y-2">
                  {impact.breachExamples.slice(0, 2).map((example, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-white dark:bg-orange-950/40 rounded border border-orange-200 dark:border-orange-800"
                    >
                      <p className="text-xs font-medium text-orange-900 dark:text-orange-100">
                        {example.headline}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-orange-700 dark:text-orange-300">
                        {example.company && <span>{example.company}</span>}
                        <span>({example.year})</span>
                        {example.cost && (
                          <>
                            <span>•</span>
                            <span className="font-medium">{example.cost}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financial Impact Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2 bg-white dark:bg-orange-950/40 rounded border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300 mb-1">
                  <DollarSign className="h-3 w-3" />
                  Avg. Breach Cost
                </div>
                <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                  {impact.financialImpact.avgBreachCost}
                </p>
              </div>

              <div className="p-2 bg-white dark:bg-orange-950/40 rounded border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300 mb-1">
                  <Clock className="h-3 w-3" />
                  Recovery Time
                </div>
                <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                  {impact.financialImpact.recoveryTime}
                </p>
              </div>

              {impact.financialImpact.potentialFines && (
                <div className="p-2 bg-white dark:bg-orange-950/40 rounded border border-orange-200 dark:border-orange-800 sm:col-span-1">
                  <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300 mb-1">
                    <Scale className="h-3 w-3" />
                    Potential Fines
                  </div>
                  <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                    {impact.financialImpact.potentialFines}
                  </p>
                </div>
              )}
            </div>

            {/* Quick Fix */}
            <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-900">
              <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
                ✓ Quick Fix:
              </p>
              <p className="text-sm text-green-900 dark:text-green-100">
                {impact.quickFix}
              </p>
            </div>

            {/* Collapse Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
              className="w-full gap-2"
            >
              <ChevronUp className="h-4 w-4" />
              Hide
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
