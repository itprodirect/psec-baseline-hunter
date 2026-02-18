"use client";

import { MobileNav, NavSidebar } from "@/components/layout/nav-sidebar";
import { DemoProvider } from "@/lib/context/demo-context";
import { PersonaProvider } from "@/lib/context/persona-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PersonaProvider>
      <DemoProvider>
        <div className="flex h-screen">
          <div className="hidden md:block">
            <NavSidebar />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <MobileNav />
            <main className="flex-1 overflow-auto">
              <div className="container mx-auto p-4 sm:p-6">{children}</div>
            </main>
          </div>
        </div>
      </DemoProvider>
    </PersonaProvider>
  );
}
