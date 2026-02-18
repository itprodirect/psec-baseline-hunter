"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";

interface SaveComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  error: string | null;
  network: string;
  title: string;
  notes: string;
  onTitleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
}

export function SaveComparisonDialog({
  open,
  onOpenChange,
  isSaving,
  error,
  network,
  title,
  notes,
  onTitleChange,
  onNotesChange,
  onSave,
}: SaveComparisonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Comparison</DialogTitle>
          <DialogDescription>
            Save this comparison with a shareable URL for later reference.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && (
            <div className="p-2 text-sm text-red-600 bg-red-50 rounded">
              {error}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Title (optional)</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 border rounded-md"
              placeholder={`${network} comparison`}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 border rounded-md"
              rows={3}
              placeholder="Add notes about this comparison..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Comparison"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
