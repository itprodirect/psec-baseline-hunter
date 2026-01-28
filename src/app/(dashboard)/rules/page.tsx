"use client";

import { useState, useEffect } from "react";
import { CustomRiskRule, RiskLevel } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Plus, Trash2, Shield, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function RulesPage() {
  const [rules, setRules] = useState<CustomRiskRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [networkFilter, setNetworkFilter] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [formPort, setFormPort] = useState("");
  const [formProtocol, setFormProtocol] = useState<"tcp" | "udp">("tcp");
  const [formNetwork, setFormNetwork] = useState("*");
  const [formAction, setFormAction] = useState<"override" | "whitelist">("override");
  const [formRisk, setFormRisk] = useState<RiskLevel>("P0");
  const [formReason, setFormReason] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Load rules
  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      setLoading(true);
      const response = await fetch("/api/rules");
      const data = await response.json();

      if (data.success) {
        setRules(data.rules || []);
      } else {
        setError(data.error || "Failed to load rules");
      }
    } catch (err) {
      setError("Failed to load rules");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    setFormSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: parseInt(formPort),
          protocol: formProtocol,
          network: formNetwork,
          action: formAction,
          customRisk: formAction === "override" ? formRisk : undefined,
          reason: formReason,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRules([...rules, data.rule]);
        setShowAddForm(false);
        resetForm();
      } else {
        setError(data.error || "Failed to create rule");
      }
    } catch (err) {
      setError("Failed to create rule");
      console.error(err);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDeleteRule(ruleId: string) {
    if (!confirm("Are you sure you want to delete this rule?")) return;

    try {
      const response = await fetch(`/api/rules/${ruleId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setRules(rules.filter((r) => r.ruleId !== ruleId));
      } else {
        setError(data.error || "Failed to delete rule");
      }
    } catch (err) {
      setError("Failed to delete rule");
      console.error(err);
    }
  }

  function resetForm() {
    setFormPort("");
    setFormProtocol("tcp");
    setFormNetwork("*");
    setFormAction("override");
    setFormRisk("P0");
    setFormReason("");
  }

  // Get unique networks from rules
  const networks = ["all", "*", ...new Set(rules.map((r) => r.network).filter((n) => n !== "*"))];

  // Filter rules by network
  const filteredRules = networkFilter === "all"
    ? rules
    : rules.filter((r) => r.network === networkFilter);

  function getRiskBadgeVariant(risk: RiskLevel): "destructive" | "default" | "secondary" {
    if (risk === "P0") return "destructive";
    if (risk === "P1") return "default";
    return "secondary";
  }

  function getRiskLabel(risk: RiskLevel): string {
    if (risk === "P0") return "Critical";
    if (risk === "P1") return "High";
    return "Watch";
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-muted-foreground">Loading rules...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Custom Risk Rules</h1>
          <p className="text-muted-foreground mt-1">
            Override default risk classifications or whitelist ports for specific networks
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How Rules Work</AlertTitle>
        <AlertDescription>
          Rules are evaluated in this order: network-specific rules first, then global rules (*), then default classifications.
          Use &quot;override&quot; to change a port&apos;s risk level, or &quot;whitelist&quot; to exclude it from risk reports.
        </AlertDescription>
      </Alert>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Add Rule Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Rule</CardTitle>
            <CardDescription>
              Define a custom risk classification for a specific port and network
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRule} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="port">Port Number</Label>
                  <Input
                    id="port"
                    type="number"
                    placeholder="e.g., 8080"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    required
                    min={1}
                    max={65535}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="protocol">Protocol</Label>
                  <Select value={formProtocol} onValueChange={(v) => setFormProtocol(v as "tcp" | "udp")}>
                    <SelectTrigger id="protocol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="network">Network</Label>
                  <Input
                    id="network"
                    placeholder="* for global, or network name"
                    value={formNetwork}
                    onChange={(e) => setFormNetwork(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use * for global rule, or enter specific network name
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="action">Action</Label>
                  <Select value={formAction} onValueChange={(v) => setFormAction(v as "override" | "whitelist")}>
                    <SelectTrigger id="action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="override">Override Risk Level</SelectItem>
                      <SelectItem value="whitelist">Whitelist (Ignore)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formAction === "override" && (
                <div className="space-y-2">
                  <Label htmlFor="risk">Custom Risk Level</Label>
                  <Select value={formRisk} onValueChange={(v) => setFormRisk(v as RiskLevel)}>
                    <SelectTrigger id="risk">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="P0">P0 - Critical</SelectItem>
                      <SelectItem value="P1">P1 - High</SelectItem>
                      <SelectItem value="P2">P2 - Watch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  placeholder="Why is this rule needed? (e.g., 'Internal dev server, safe for our network')"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  required
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={formSubmitting}>
                  {formSubmitting ? "Creating..." : "Create Rule"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Rules ({filteredRules.length})</CardTitle>
              <CardDescription>
                Custom risk classifications currently in effect
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="network-filter" className="text-sm">Filter:</Label>
              <Select value={networkFilter} onValueChange={setNetworkFilter}>
                <SelectTrigger id="network-filter" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {networks.map((net) => (
                    <SelectItem key={net} value={net}>
                      {net === "all" ? "All Networks" : net === "*" ? "Global (*)" : net}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRules.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No rules found. Click &quot;Add Rule&quot; to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRules.map((rule) => (
                <div
                  key={rule.ruleId}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono font-semibold">
                        {rule.port}/{rule.protocol}
                      </span>
                    </div>

                    <Badge variant={rule.network === "*" ? "default" : "secondary"}>
                      {rule.network === "*" ? "Global" : rule.network}
                    </Badge>

                    {rule.action === "whitelist" ? (
                      <Badge variant="outline">Whitelisted</Badge>
                    ) : (
                      <Badge variant={getRiskBadgeVariant(rule.customRisk!)}>
                        {getRiskLabel(rule.customRisk!)}
                      </Badge>
                    )}

                    <p className="text-sm text-muted-foreground flex-1">{rule.reason}</p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteRule(rule.ruleId)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rules.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Global Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rules.filter((r) => r.network === "*").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Networks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(rules.filter((r) => r.network !== "*").map((r) => r.network)).size}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
