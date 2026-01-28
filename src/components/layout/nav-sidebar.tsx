"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Upload, BarChart3, GitCompare, Shield, FileSpreadsheet, Settings, History } from "lucide-react";
import { PersonaToggle } from "./persona-toggle";

const navItems = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    description: "Network health overview",
  },
  {
    title: "Start Scan Review",
    href: "/upload",
    icon: Upload,
    description: "Import scan files",
  },
  {
    title: "Health Overview",
    href: "/scorecard",
    icon: BarChart3,
    description: "Single run analysis",
  },
  {
    title: "Changes",
    href: "/diff",
    icon: GitCompare,
    description: "Compare runs",
  },
  {
    title: "History",
    href: "/history",
    icon: History,
    description: "Saved comparisons",
  },
  {
    title: "Custom Rules",
    href: "/rules",
    icon: Settings,
    description: "Manage risk rules",
  },
];

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-background">
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <div className="font-semibold text-sm">PSEC Baseline Hunter</div>
          <div className="text-xs text-muted-foreground">Network Security</div>
        </div>
      </div>

      {/* Persona Toggle */}
      <div className="border-b px-3 py-2">
        <PersonaToggle />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <div>
                <div className="font-medium">{item.title}</div>
                <div
                  className={cn(
                    "text-xs",
                    isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}
                >
                  {item.description}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Help Section */}
      <div className="border-t p-4 space-y-2">
        <a
          href="/scripts/network-scan.ps1"
          download
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileSpreadsheet className="h-3 w-3" />
          Download Scan Script
        </a>
        <div className="text-xs text-muted-foreground">
          v0.5.0 - AI-Powered Insights
        </div>
      </div>
    </aside>
  );
}
