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
        <div className="flex h-screen print:block print:h-auto">
          <div className="hidden md:block">
            <NavSidebar />
          </div>

          <div className="flex min-w-0 flex-1 flex-col print:block">
            <MobileNav />
            <main className="flex-1 overflow-auto print:overflow-visible">
              <div className="container mx-auto p-4 sm:p-6 print:max-w-none print:p-0">{children}</div>
            </main>
          </div>
        </div>
      </DemoProvider>
    </PersonaProvider>
  );
}
