"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DiffEmptyState() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Device Additions</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Devices Not Observed</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Service Additions</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Services Not Observed</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Review Findings</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No comparison has been evaluated. Select two compatible runs and click Compare Runs;
            conclusions and export controls appear only after an evidence assessment succeeds.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
