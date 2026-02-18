"use client";

import { RunManifestInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface RunSelectorProps {
  label: string;
  runs: RunManifestInfo[];
  selectedRunUid: string | null;
  onSelect: (runUid: string) => void;
  disabledRunUid?: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function RunSelector({
  label,
  runs,
  selectedRunUid,
  onSelect,
  disabledRunUid,
  isOpen,
  onToggle,
}: RunSelectorProps) {
  const selectedRun = runs.find((r) => r.runUid === selectedRunUid);
  const availableRuns = runs.filter((r) => r.runUid !== disabledRunUid);

  return (
    <div className="flex-1">
      <label className="text-sm font-medium text-muted-foreground mb-2 block">
        {label}
      </label>
      <div className="relative">
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={onToggle}
        >
          {selectedRun ? (
            <span className="truncate">
              {selectedRun.network} - {selectedRun.folderName}
            </span>
          ) : (
            <span className="text-muted-foreground">Select a run...</span>
          )}
          <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
        </Button>
        {isOpen && (
          <div className="absolute z-10 mt-1 w-full bg-background border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {availableRuns.length === 0 ? (
              <div className="px-4 py-2 text-sm text-muted-foreground">
                No other runs available
              </div>
            ) : (
              availableRuns.map((run) => (
                <button
                  key={run.runUid}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg"
                  onClick={() => {
                    onSelect(run.runUid);
                    onToggle();
                  }}
                >
                  <div className="font-medium">{run.network}</div>
                  <div className="text-xs text-muted-foreground">
                    {run.folderName}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
