"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ScorecardEmptyState() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Hosts</CardDescription>
            <CardTitle className="text-4xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Ports</CardDescription>
            <CardTitle className="text-4xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Services</CardDescription>
            <CardTitle className="text-4xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Risk Ports</CardDescription>
            <CardTitle className="text-4xl">-</CardTitle>
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
            Select a run above to view port analysis.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
