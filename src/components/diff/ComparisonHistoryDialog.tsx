"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, History, Trash2 } from "lucide-react";
import { SavedComparison } from "@/lib/types";

interface ComparisonHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparisons: SavedComparison[];
  isLoading: boolean;
  onDeleteComparison: (comparisonId: string) => void;
}

export function ComparisonHistoryDialog({
  open,
  onOpenChange,
  comparisons,
  isLoading,
  onDeleteComparison,
}: ComparisonHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-1" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Saved Comparisons</DialogTitle>
          <DialogDescription>
            View and load previously saved comparisons.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : comparisons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No saved comparisons yet. Save a comparison to see it here.
            </p>
          ) : (
            <div className="space-y-2">
              {comparisons.map((comp) => (
                <div
                  key={comp.comparisonId}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <a
                    href={`/diff/${comp.comparisonId}`}
                    className="flex-1"
                  >
                    <div className="font-medium">
                      {comp.title || `${comp.network} comparison`}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{comp.network}</span>
                      <span>|</span>
                      <span>{new Date(comp.createdAt).toLocaleDateString()}</span>
                      <span>|</span>
                      <Badge
                        variant={comp.riskScore >= 70 ? "secondary" : comp.riskScore >= 50 ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {comp.riskScore}/100
                      </Badge>
                    </div>
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteComparison(comp.comparisonId)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
