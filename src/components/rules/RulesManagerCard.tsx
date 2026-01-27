"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings, Plus, Trash2, Shield, ShieldOff, Loader2 } from "lucide-react";
import { CustomRiskRule, RiskLevel, RuleAction, RulesResponse } from "@/lib/types";

interface RulesManagerCardProps {
  network?: string;
  onRulesChange?: () => void;
}

export function RulesManagerCard({ network, onRulesChange }: RulesManagerCardProps) {
  const [rules, setRules] = useState<CustomRiskRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formPort, setFormPort] = useState("");
  const [formProtocol, setFormProtocol] = useState<"tcp" | "udp">("tcp");
  const [formNetwork, setFormNetwork] = useState(network || "*");
  const [formAction, setFormAction] = useState<RuleAction>("whitelist");
  const [formRisk, setFormRisk] = useState<RiskLevel>("P2");
  const [formReason, setFormReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadRules();
  }, [network]);

  async function loadRules() {
    setIsLoading(true);
    try {
      const url = network ? `/api/rules?network=${encodeURIComponent(network)}` : "/api/rules";
      const response = await fetch(url);
      const data: RulesResponse = await response.json();
      if (data.success && data.rules) {
        setRules(data.rules);
      }
    } catch (err) {
      console.error("Failed to load rules:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateRule() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: parseInt(formPort, 10),
          protocol: formProtocol,
          network: formNetwork,
          action: formAction,
          customRisk: formAction === "override" ? formRisk : undefined,
          reason: formReason,
        }),
      });

      const data: RulesResponse = await response.json();

      if (data.success) {
        setIsDialogOpen(false);
        resetForm();
        loadRules();
        onRulesChange?.();
      } else {
        setError(data.error || "Failed to create rule");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteRule(ruleId: string) {
    try {
      const response = await fetch(`/api/rules/${ruleId}`, {
        method: "DELETE",
      });

      const data: RulesResponse = await response.json();

      if (data.success) {
        loadRules();
        onRulesChange?.();
      }
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  }

  function resetForm() {
    setFormPort("");
    setFormProtocol("tcp");
    setFormNetwork(network || "*");
    setFormAction("whitelist");
    setFormRisk("P2");
    setFormReason("");
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Custom Risk Rules
          </span>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetForm}>
                <Plus className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Custom Risk Rule</DialogTitle>
                <DialogDescription>
                  Override the default risk classification for a specific port.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {error && (
                  <div className="p-2 text-sm text-red-600 bg-red-50 rounded">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Port</label>
                    <input
                      type="number"
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                      placeholder="e.g., 8080"
                      value={formPort}
                      onChange={(e) => setFormPort(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Protocol</label>
                    <select
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                      value={formProtocol}
                      onChange={(e) => setFormProtocol(e.target.value as "tcp" | "udp")}
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Network</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    placeholder="Network name or * for global"
                    value={formNetwork}
                    onChange={(e) => setFormNetwork(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use * for a global rule that applies to all networks
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">Action</label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="action"
                        checked={formAction === "whitelist"}
                        onChange={() => setFormAction("whitelist")}
                      />
                      <ShieldOff className="h-4 w-4 text-green-600" />
                      Whitelist (no risk)
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="action"
                        checked={formAction === "override"}
                        onChange={() => setFormAction("override")}
                      />
                      <Shield className="h-4 w-4 text-yellow-600" />
                      Override risk level
                    </label>
                  </div>
                </div>

                {formAction === "override" && (
                  <div>
                    <label className="text-sm font-medium">Risk Level</label>
                    <select
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                      value={formRisk}
                      onChange={(e) => setFormRisk(e.target.value as RiskLevel)}
                    >
                      <option value="P0">P0 - Critical</option>
                      <option value="P1">P1 - High</option>
                      <option value="P2">P2 - Context-dependent</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Reason</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    rows={2}
                    placeholder="Why is this rule needed?"
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateRule}
                    disabled={!formPort || !formReason || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Rule"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
        <CardDescription>
          Customize risk classifications for specific ports and networks
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading rules...
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No custom rules defined. Default risk classifications will be used.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.ruleId}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {rule.action === "whitelist" ? (
                    <ShieldOff className="h-4 w-4 text-green-600" />
                  ) : (
                    <Shield className="h-4 w-4 text-yellow-600" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">
                        {rule.port}/{rule.protocol}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {rule.network === "*" ? "Global" : rule.network}
                      </Badge>
                      {rule.action === "whitelist" ? (
                        <Badge variant="secondary" className="text-xs">
                          Whitelisted
                        </Badge>
                      ) : (
                        <Badge
                          variant={
                            rule.customRisk === "P0"
                              ? "destructive"
                              : rule.customRisk === "P1"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {rule.customRisk}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rule.reason}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteRule(rule.ruleId)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
