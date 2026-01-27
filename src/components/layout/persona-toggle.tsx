"use client";

import { Badge } from "@/components/ui/badge";
import { User, Sparkles } from "lucide-react";
import { usePersona } from "@/lib/context/persona-context";
import {
  TECHNICAL_LEVEL_LABELS,
  PROFESSION_LABELS,
} from "@/lib/types/userProfile";

export function PersonaToggle() {
  const { profile, hasProfile } = usePersona();

  const techLabel = TECHNICAL_LEVEL_LABELS[profile.technicalLevel]?.label || "Not set";
  const profLabel = PROFESSION_LABELS[profile.profession]?.label || "Not set";

  return (
    <div className="space-y-2">
      {/* Current Profile Display */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
        <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          {hasProfile ? (
            <>
              <div className="text-xs font-medium truncate">{profLabel}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {techLabel}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              No profile set yet
            </div>
          )}
        </div>
      </div>

      {/* How to customize hint */}
      <div className="flex items-start gap-2 px-2 py-1.5 text-[10px] text-muted-foreground">
        <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          {hasProfile ? (
            <>Summaries are tailored to your profile. Click <strong>&quot;Explain This&quot;</strong> on any page to adjust.</>
          ) : (
            <>Click <strong>&quot;Explain This for My Situation&quot;</strong> on Health Overview or Changes to personalize your reports.</>
          )}
        </span>
      </div>
    </div>
  );
}
