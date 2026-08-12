"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UserProfile,
  TechnicalLevel,
  Profession,
  ContextFactor,
  ExplanationTone,
  TECHNICAL_LEVEL_LABELS,
  PROFESSION_LABELS,
  CONTEXT_FACTOR_LABELS,
  TONE_LABELS,
} from "@/lib/types/userProfile";
import { usePersona } from "@/lib/context/persona-context";

interface PersonalizedSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (profile: UserProfile) => void;
  isLoading?: boolean;
}

export function PersonalizedSummaryModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
}: PersonalizedSummaryModalProps) {
  // Use shared persona context instead of local state
  const { profile, setProfile } = usePersona();
  const [step, setStep] = useState(1);

  // Update profile through context (which handles localStorage)
  const saveProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
  };

  const handleSubmit = () => {
    onSubmit(profile);
  };

  const toggleContextFactor = (factor: ContextFactor) => {
    const newFactors = profile.contextFactors.includes(factor)
      ? profile.contextFactors.filter((f) => f !== factor)
      : [...profile.contextFactors, factor];
    saveProfile({ ...profile, contextFactors: newFactors });
  };

  const totalSteps = 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Format Your Evidence Report</DialogTitle>
          <DialogDescription>
            Record deterministic presentation context. It does not change the evidence or supported conclusions.
            Step {step} of {totalSteps}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex gap-1 mb-4">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Technical Level */}
        {step === 1 && (
          <div className="space-y-4">
            <h4 className="font-medium">What&apos;s your technical background?</h4>
            <div className="grid gap-2">
              {(Object.keys(TECHNICAL_LEVEL_LABELS) as TechnicalLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => saveProfile({ ...profile, technicalLevel: level })}
                  className={`p-3 text-left rounded-lg border transition-colors ${
                    profile.technicalLevel === level
                      ? "border-primary bg-primary/10"
                      : "border-muted hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium">{TECHNICAL_LEVEL_LABELS[level].label}</div>
                  <div className="text-sm text-muted-foreground">
                    {TECHNICAL_LEVEL_LABELS[level].description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Profession */}
        {step === 2 && (
          <div className="space-y-4">
            <h4 className="font-medium">What best describes your role?</h4>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2">
              {(Object.keys(PROFESSION_LABELS) as Profession[]).map((prof) => (
                <button
                  key={prof}
                  onClick={() => saveProfile({ ...profile, profession: prof })}
                  className={`p-3 text-left rounded-lg border transition-colors ${
                    profile.profession === prof
                      ? "border-primary bg-primary/10"
                      : "border-muted hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium">{PROFESSION_LABELS[prof].label}</div>
                  <div className="text-sm text-muted-foreground">
                    {PROFESSION_LABELS[prof].description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Context Factors */}
        {step === 3 && (
          <div className="space-y-4">
            <h4 className="font-medium">Select all that apply to your situation:</h4>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CONTEXT_FACTOR_LABELS) as ContextFactor[]).map((factor) => (
                <Badge
                  key={factor}
                  variant={profile.contextFactors.includes(factor) ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1.5 text-sm"
                  onClick={() => toggleContextFactor(factor)}
                >
                  {CONTEXT_FACTOR_LABELS[factor].label}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              These are recorded as presentation context only; they do not establish risk or change the findings.
            </p>
          </div>
        )}

        {/* Step 4: Tone */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-medium">What presentation tone should the report record?</h4>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TONE_LABELS) as ExplanationTone[]).map((tone) => (
                  <button
                    key={tone}
                    onClick={() => saveProfile({ ...profile, tone })}
                    className={`p-3 text-left rounded-lg border transition-colors ${
                      profile.tone === tone
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium">{TONE_LABELS[tone].label}</div>
                    <div className="text-xs text-muted-foreground">
                      {TONE_LABELS[tone].description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
              Reports are rendered deterministically on the server from the authoritative evidence state. No free-form AI provider receives the scan data.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isLoading}>
              Back
            </Button>
          )}
          {step < totalSteps ? (
            <Button onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate Report"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
