"use client";

/**
 * Traffic Visualizer ("Packet Highway")
 *
 * Upload a saved PCAP/PCAPNG (plus an optional device inventory CSV) and
 * see your network as an animated city: devices are buildings, the router
 * is a toll plaza, and traffic drives between them. V0: metadata only,
 * rule-based explanations, no LLM calls.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, ExternalLink, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NormalizedCapture, TrafficAnalyzeResponse } from "@/lib/types/packet-highway";
import type { ObservationRegistryRecord } from "@/lib/types/observation-registry";
import type { PacketHighwayCollectionVantage } from "@/lib/services/packet-highway-observation";
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

type VantageSelection = PacketHighwayCollectionVantage | "";

interface PacketHighwayObservationResponse {
  success: boolean;
  observation?: ObservationRegistryRecord;
  error?: string;
}

interface PacketHighwaySaveResponse {
  success: boolean;
  observation?: {
    registryId: string;
    observationId: string;
  };
  isNew?: boolean;
  duplicateOf?: string;
  packetHighwayHref?: string;
  error?: string;
}

interface LoadedObservationNotice {
  registryId: string;
  label: string;
  summary: string;
  canSupport: string[];
  cannotProve: string[];
  limitations: string[];
}

interface SaveState {
  href: string;
  registryId: string;
  isNew: boolean;
  duplicateOf?: string;
}

export default function PacketHighwayPage() {
  const [capture, setCapture] = useState<NormalizedCapture | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingObservation, setIsLoadingObservation] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [networkScope, setNetworkScope] = useState("");
  const [collectionVantage, setCollectionVantage] = useState<VantageSelection>("");
  const [isSavingObservation, setIsSavingObservation] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [loadedObservation, setLoadedObservation] = useState<LoadedObservationNotice | null>(null);

  useEffect(() => {
    const registryId = new URLSearchParams(window.location.search).get("observation");
    if (!registryId) return;
    const observationRegistryId = registryId;

    let cancelled = false;
    async function loadSavedObservation() {
      setIsLoadingObservation(true);
      setServerError(null);
      try {
        const response = await fetch(`/api/observations/${encodeURIComponent(observationRegistryId)}`);
        const result: PacketHighwayObservationResponse = await response.json();
        if (!response.ok || !result.success || !result.observation) {
          throw new Error(result.error || "Saved Packet Highway observation could not be opened.");
        }

        const observation = result.observation;
        const supplemental = observation.bundle.supplementalEvidence?.find(
          (item) => item.kind === "packet-highway-analysis" && item.packetHighway
        );
        const packetHighway = supplemental?.packetHighway;
        if (!supplemental || !packetHighway) {
          throw new Error("This observation does not include Packet Highway visual metadata.");
        }

        if (cancelled) return;
        setCapture(packetHighway.capture);
        setIsDemo(false);
        setSelectedDeviceId(findFirstUnknownDeviceId(packetHighway.capture));
        setSiteName(observation.site.networkName);
        setNetworkScope(observation.site.networkScope ?? "");
        setCollectionVantage(vantageFromObservationType(observation.vantage.type));
        setLoadedObservation({
          registryId: observation.registryId,
          label: supplemental.label,
          summary: supplemental.summary,
          canSupport: packetHighway.canSupport,
          cannotProve: packetHighway.cannotProve,
          limitations: packetHighway.limitations,
        });
      } catch (error) {
        if (!cancelled) {
          setServerError(error instanceof Error ? error.message : "Saved observation could not be opened.");
        }
      } finally {
        if (!cancelled) setIsLoadingObservation(false);
      }
    }

    void loadSavedObservation();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetSaveState = useCallback(() => {
    setSaveError(null);
    setSaveState(null);
    setLoadedObservation(null);
  }, []);

  const handleAnalyze = useCallback(
    async (captureFile: File, inventory: File | null) => {
      setIsAnalyzing(true);
      setServerError(null);
      setCapture(null);
      setIsDemo(false);
      setSelectedDeviceId(null);
      setSiteName("");
      setNetworkScope("");
      setCollectionVantage("");
      resetSaveState();
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
    },
    [resetSaveState]
  );

  const handleLoadDemo = useCallback(() => {
    const demoCapture = buildDemoCapture();
    setServerError(null);
    setCapture(demoCapture);
    setIsDemo(true);
    setSelectedDeviceId(findFirstUnknownDeviceId(demoCapture));
    setSiteName("Guided home network");
    setNetworkScope("192.168.50.0/24");
    setCollectionVantage("gateway-router");
    resetSaveState();
  }, [resetSaveState]);

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

  const handleSaveObservation = useCallback(async () => {
    if (!capture || !collectionVantage) return;
    setIsSavingObservation(true);
    setSaveError(null);
    setSaveState(null);
    try {
      const response = await fetch("/api/packet-highway/observations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capture,
          site: {
            networkName: siteName,
            networkScope: networkScope || null,
          },
          collectionVantage,
        }),
      });
      const result: PacketHighwaySaveResponse = await response.json();
      if (!response.ok || !result.success || !result.observation || !result.packetHighwayHref) {
        throw new Error(result.error || "Packet Highway observation could not be saved.");
      }
      setSaveState({
        href: result.packetHighwayHref,
        registryId: result.observation.registryId,
        isNew: result.isNew ?? true,
        duplicateOf: result.duplicateOf,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Packet Highway observation could not be saved.");
    } finally {
      setIsSavingObservation(false);
    }
  }, [capture, collectionVantage, networkScope, siteName]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Traffic Visualizer</h1>
          <p className="text-sm text-muted-foreground">
            Explore devices and traffic observed in this capture as a calm map of evidence.
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
        isAnalyzing={isAnalyzing || isLoadingObservation}
        serverError={serverError}
      />

      {capture && (
        <>
          <AnalysisSourceNotice capture={capture} isDemo={isDemo} />
          {loadedObservation && <LoadedObservationPanel observation={loadedObservation} />}

          {capture.meta.truncated && <PartialAnalysisNotice />}

          <PacketHighwayObservationSavePanel
            siteName={siteName}
            networkScope={networkScope}
            collectionVantage={collectionVantage}
            isSaving={isSavingObservation}
            saveError={saveError}
            saveState={saveState}
            onSiteNameChange={(value) => {
              setSiteName(value);
              setSaveError(null);
            }}
            onNetworkScopeChange={(value) => {
              setNetworkScope(value);
              setSaveError(null);
            }}
            onCollectionVantageChange={(value) => {
              setCollectionVantage(value);
              setSaveError(null);
            }}
            onSave={handleSaveObservation}
          />

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

function LoadedObservationPanel({ observation }: { observation: LoadedObservationNotice }) {
  return (
    <Card className="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{observation.label}</CardTitle>
        <CardDescription>{observation.summary}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
        <EvidenceList title="Can support" values={observation.canSupport} />
        <EvidenceList title="Cannot prove" values={observation.cannotProve} />
        <EvidenceList title="Limits" values={observation.limitations} />
      </CardContent>
    </Card>
  );
}

function PacketHighwayObservationSavePanel({
  siteName,
  networkScope,
  collectionVantage,
  isSaving,
  saveError,
  saveState,
  onSiteNameChange,
  onNetworkScopeChange,
  onCollectionVantageChange,
  onSave,
}: {
  siteName: string;
  networkScope: string;
  collectionVantage: VantageSelection;
  isSaving: boolean;
  saveError: string | null;
  saveState: SaveState | null;
  onSiteNameChange: (value: string) => void;
  onNetworkScopeChange: (value: string) => void;
  onCollectionVantageChange: (value: VantageSelection) => void;
  onSave: () => void;
}) {
  const canSave = siteName.trim().length > 0 && collectionVantage !== "" && !isSaving;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Save as supplemental observation</CardTitle>
        <CardDescription>
          Stores normalized Packet Highway metadata only. Network Activity can link to it as visual context.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="packet-highway-site">Site or network</Label>
            <Input
              id="packet-highway-site"
              value={siteName}
              maxLength={120}
              placeholder="Home network"
              onChange={(event) => onSiteNameChange(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="packet-highway-scope">Scope</Label>
            <Input
              id="packet-highway-scope"
              value={networkScope}
              maxLength={120}
              placeholder="Optional CIDR or segment"
              onChange={(event) => onNetworkScopeChange(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Collection vantage</Label>
            <Select
              value={collectionVantage || undefined}
              onValueChange={(value) => onCollectionVantageChange(value as PacketHighwayCollectionVantage)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Confirm vantage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this-computer">This computer only</SelectItem>
                <SelectItem value="gateway-router">Gateway/router</SelectItem>
                <SelectItem value="mirror-tap">Mirror/tap</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onSave} disabled={!canSave}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Supplemental means this capture can explain visible traffic from the selected vantage; it does not replace scan, gateway, or discovery evidence.
        </p>

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        {saveState && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-muted-foreground">
              {saveState.isNew ? "Saved observation metadata." : "Already saved as matching observation metadata."}
            </span>
            <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={saveState.href}>
              Reopen visual evidence
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-1 space-y-1">
        {values.length > 0 ? values.map((value) => <li key={value}>{value}</li>) : <li>None reported.</li>}
      </ul>
    </div>
  );
}

function vantageFromObservationType(type: string): VantageSelection {
  switch (type) {
    case "packet-highway-this-computer":
      return "this-computer";
    case "packet-highway-gateway-router":
      return "gateway-router";
    case "packet-highway-mirror-tap":
      return "mirror-tap";
    case "packet-highway-unknown":
      return "unknown";
    default:
      return "";
  }
}

function findFirstUnknownDeviceId(capture: NormalizedCapture): string | null {
  return capture.devices.find((device) => device.role === "device" && !device.isKnown)?.id ?? null;
}