"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ScorecardEmptyState() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Observed Hosts</CardDescription>
            <CardTitle className="text-4xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Observed Open Ports</CardDescription>
            <CardTitle className="text-4xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Observed Services</CardDescription>
            <CardTitle className="text-4xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Review Findings</CardDescription>
            <CardTitle className="text-4xl">-</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Observed Ports</CardTitle>
          <CardDescription>
            Most frequently recorded open ports in the selected observation
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
