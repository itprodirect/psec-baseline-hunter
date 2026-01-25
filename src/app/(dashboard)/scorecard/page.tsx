import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function ScorecardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scorecard</h1>
        <p className="text-muted-foreground">
          Analyze a single baseline scan run
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Select Run
          </CardTitle>
          <CardDescription>
            Choose a network and run to analyze
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No runs available. Upload a baselinekit ZIP first.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Hosts</CardDescription>
            <CardTitle className="text-4xl">—</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Ports</CardDescription>
            <CardTitle className="text-4xl">—</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Services</CardDescription>
            <CardTitle className="text-4xl">—</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Risk Ports</CardDescription>
            <CardTitle className="text-4xl">—</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Ports</CardTitle>
          <CardDescription>
            Most common open ports across scanned hosts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select a run to view port analysis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
