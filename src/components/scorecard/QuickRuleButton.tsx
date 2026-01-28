"use client";

import { useState } from "react";
import { RiskPort, RiskLevel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Settings, CheckCircle2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface QuickRuleButtonProps {
  riskPort: RiskPort;
  network: string;
}

export function QuickRuleButton({ riskPort, network }: QuickRuleButtonProps) {
  const [open, setOpen] = useState(false);
  const [formNetwork, setFormNetwork] = useState(network);
  const [formAction, setFormAction] = useState<"override" | "whitelist">("override");
  const [formRisk, setFormRisk] = useState<RiskLevel>(riskPort.risk);
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: riskPort.port,
          protocol: riskPort.protocol,
          network: formNetwork,
          action: formAction,
          customRisk: formAction === "override" ? formRisk : undefined,
          reason: formReason,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          setOpen(false);
          resetForm();
        }, 1500);
      } else {
        setError(data.error || "Failed to create rule");
      }
    } catch (err) {
      setError("Failed to create rule");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setFormNetwork(network);
    setFormAction("override");
    setFormRisk(riskPort.risk);
    setFormReason("");
    setSuccess(false);
    setError(null);
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-3 w-3 mr-1" />
          Create Rule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Custom Rule</DialogTitle>
          <DialogDescription>
            Define a custom risk classification for port {riskPort.port}/{riskPort.protocol}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Rule created successfully!
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="quick-network">Network</Label>
              <Input
                id="quick-network"
                value={formNetwork}
                onChange={(e) => setFormNetwork(e.target.value)}
                placeholder="* for global, or specific network"
                required
              />
              <p className="text-xs text-muted-foreground">
                Current network: {network}. Change to * for global rule.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-action">Action</Label>
              <Select value={formAction} onValueChange={(v) => setFormAction(v as "override" | "whitelist")}>
                <SelectTrigger id="quick-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="override">Override Risk Level</SelectItem>
                  <SelectItem value="whitelist">Whitelist (Ignore)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formAction === "override" && (
              <div className="space-y-2">
                <Label htmlFor="quick-risk">New Risk Level</Label>
                <Select value={formRisk} onValueChange={(v) => setFormRisk(v as RiskLevel)}>
                  <SelectTrigger id="quick-risk">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P0">P0 - Critical</SelectItem>
                    <SelectItem value="P1">P1 - High</SelectItem>
                    <SelectItem value="P2">P2 - Watch</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Current: {riskPort.risk}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="quick-reason">Reason</Label>
              <Textarea
                id="quick-reason"
                placeholder="Why is this rule needed? (e.g., 'Internal dev server, safe for our network')"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                required
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Rule"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
