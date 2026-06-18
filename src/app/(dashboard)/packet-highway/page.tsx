"use client";

/**
 * Traffic Visualizer ("Packet Highway")
 *
 * Upload a saved PCAP/PCAPNG (plus an optional device inventory CSV) and
 * see your network as an animated city: devices are buildings, the router
 * is a toll plaza, and traffic drives between them. V0: metadata only,
 * rule-based explanations, no LLM calls.
 */

import { useCallback, useState } from "react";
import { Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NormalizedCapture, TrafficAnalyzeResponse } from "@/lib/types/packet-highway";
import { buildDemoCapture } from "@/lib/demo/packet-highway-demo";
import { UploadPanel } from "@/components/packet-highway/UploadPanel";
import { MetricsCards } from "@/components/packet-highway/MetricsCards";
import { HighwayScene } from "@/components/packet-highway/HighwayScene";
import { Legend } from "@/components/packet-highway/Legend";
import { SummaryPanel } from "@/components/packet-highway/SummaryPanel";
import { DeviceDetails } from "@/components/packet-highway/DeviceDetails";
import { DnsPanel, FlowTable } from "@/components/packet-highway/FlowTable";
import {
  AnalysisSourceNotice,
  ExportMetadataNotice,
  PartialAnalysisNotice,
} from "@/components/packet-highway/TrustNotices";

export default function PacketHighwayPage() {
  const [capture, setCapture] = useState<NormalizedCapture | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const handleAnalyze = useCallback(async (captureFile: File, inventory: File | null) => {
    setIsAnalyzing(true);
    setServerError(null);
    setCapture(null);
    setIsDemo(false);
    setSelectedDeviceId(null);
    try {
      const formData = new FormData();
      formData.append("capture", captureFile);
      if (inventory) formData.append("inventory", inventory);

      const response = await fetch("/api/packet-highway/analyze", {
        method: "POST",
        body: formData,
      });
      const result: TrafficAnalyzeResponse = await response.json();
      if (result.success && result.data) {
        setCapture(result.data);
        setIsDemo(false);
      } else {
        setServerError(result.error || "Could not analyze this capture.");
      }
    } catch {
      setServerError("Could not reach the analyzer. Is the app still running?");
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleLoadDemo = useCallback(() => {
    const demoCapture = buildDemoCapture();
    setServerError(null);
    setCapture(demoCapture);
    setIsDemo(true);
    setSelectedDeviceId(findFirstUnknownDeviceId(demoCapture));
  }, []);

  const handleDownload = useCallback(() => {
    if (!capture) return;
    const blob = new Blob([JSON.stringify(capture, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `traffic-analysis-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [capture]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Traffic Visualizer</h1>
          <p className="text-sm text-muted-foreground">
            See who&apos;s on your network and where traffic goes — as a city of buildings,
            roads, and vehicles. No jargon required.
          </p>
        </div>
        {capture && (
          <div className="flex max-w-xl flex-col items-start gap-2 sm:items-end sm:text-right">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevealSensitive((r) => !r)}
                aria-pressed={revealSensitive}
              >
                {revealSensitive ? (
                  <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                )}
                {revealSensitive ? "Hide technical details" : "Show technical details"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Save analysis (JSON)
              </Button>
            </div>
            <ExportMetadataNotice />
          </div>
        )}
      </div>

      <UploadPanel
        onAnalyze={handleAnalyze}
        onLoadDemo={handleLoadDemo}
        isAnalyzing={isAnalyzing}
        serverError={serverError}
      />

      {capture && (
        <>
          <AnalysisSourceNotice capture={capture} isDemo={isDemo} />

          {capture.meta.truncated && <PartialAnalysisNotice />}

          <MetricsCards capture={capture} />

          <HighwayScene
            capture={capture}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
          />

          {selectedDeviceId && (
            <DeviceDetails
              capture={capture}
              deviceId={selectedDeviceId}
              revealSensitive={revealSensitive}
              onClose={() => setSelectedDeviceId(null)}
            />
          )}

          <Legend capture={capture} />
          <SummaryPanel capture={capture} />

          <div className="grid gap-4 lg:grid-cols-2">
            <FlowTable capture={capture} revealSensitive={revealSensitive} />
            <DnsPanel capture={capture} revealSensitive={revealSensitive} />
          </div>
        </>
      )}
    </div>
  );
}

function findFirstUnknownDeviceId(capture: NormalizedCapture): string | null {
  return capture.devices.find((device) => device.role === "device" && !device.isKnown)?.id ?? null;
}
