"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Upload, BarChart3, GitCompare, Shield, FileSpreadsheet, Settings, History, Menu } from "lucide-react";
import { PersonaToggle } from "./persona-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
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

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 p-4">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );
}

function SidebarFooter() {
  return (
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
        v0.6.0 - Custom Rules & History
      </div>
    </div>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-16 items-center gap-2 border-b px-6">
      <Shield className="h-6 w-6 text-primary" />
      <div>
        <div className="font-semibold text-sm">PSEC Baseline Hunter</div>
        <div className="text-xs text-muted-foreground">Network Security</div>
      </div>
    </div>
  );
}

export function NavSidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-background">
      <SidebarBrand />

      <div className="border-b px-3 py-2">
        <PersonaToggle />
      </div>

      <NavLinks />
      <SidebarFooter />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="md:hidden border-b bg-background px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div className="text-sm font-semibold">PSEC Baseline Hunter</div>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open navigation">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] p-0">
            <div className="flex h-full flex-col">
              <SidebarBrand />
              <div className="border-b px-3 py-2">
                <PersonaToggle />
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
              <SidebarFooter />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
