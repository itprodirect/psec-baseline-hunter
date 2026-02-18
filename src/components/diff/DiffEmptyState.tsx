"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export function DiffEmptyState() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>New Hosts</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Removed Hosts</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ports Opened</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ports Closed</CardDescription>
            <CardTitle className="text-2xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Risky Exposures</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              -
              <Badge variant="destructive" className="text-xs">P0</Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="summary">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="hosts">Hosts</TabsTrigger>
              <TabsTrigger value="ports">Ports</TabsTrigger>
              <TabsTrigger value="risk">Risk Flags</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="mt-4">
              <p className="text-sm text-muted-foreground">
                Select two runs above and click Compare to see results.
              </p>
            </TabsContent>
            <TabsContent value="hosts" className="mt-4">
              <p className="text-sm text-muted-foreground">
                New and removed hosts will appear here.
              </p>
            </TabsContent>
            <TabsContent value="ports" className="mt-4">
              <p className="text-sm text-muted-foreground">
                Opened and closed ports will appear here.
              </p>
            </TabsContent>
            <TabsContent value="risk" className="mt-4">
              <p className="text-sm text-muted-foreground">
                P0, P1, and P2 risk flags will appear here.
              </p>
            </TabsContent>
            <TabsContent value="export" className="mt-4">
              <p className="text-sm text-muted-foreground">
                Download CHANGES.md and WATCHLIST.md exports.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
