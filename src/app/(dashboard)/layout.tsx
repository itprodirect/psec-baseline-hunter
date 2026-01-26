"use client";

import { NavSidebar } from "@/components/layout/nav-sidebar";
import { DemoProvider } from "@/lib/context/demo-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoProvider>
      <div className="flex h-screen">
        <NavSidebar />
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">{children}</div>
        </main>
      </div>
    </DemoProvider>
  );
}
