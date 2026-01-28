"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ExportCSVButtonProps {
  onExport: () => void;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export function ExportCSVButton({
  onExport,
  label = "Export CSV",
  variant = "outline",
  size = "default",
}: ExportCSVButtonProps) {
  return (
    <Button onClick={onExport} variant={variant} size={size}>
      <Download className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}
