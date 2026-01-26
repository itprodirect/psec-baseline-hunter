"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { DemoData, DemoResponse } from "@/lib/types";

interface DemoContextValue {
  isDemoMode: boolean;
  demoData: DemoData | null;
  isLoadingDemo: boolean;
  demoError: string | null;
  loadDemoData: () => Promise<void>;
  clearDemoData: () => void;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoData, setDemoData] = useState<DemoData | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const loadDemoData = useCallback(async () => {
    setIsLoadingDemo(true);
    setDemoError(null);

    try {
      const response = await fetch("/api/demo");
      const data: DemoResponse = await response.json();

      if (!data.success || !data.data) {
        throw new Error(data.error || "Failed to load demo data");
      }

      setDemoData(data.data);
      setIsDemoMode(true);
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Failed to load demo data");
      setIsDemoMode(false);
      setDemoData(null);
    } finally {
      setIsLoadingDemo(false);
    }
  }, []);

  const clearDemoData = useCallback(() => {
    setIsDemoMode(false);
    setDemoData(null);
    setDemoError(null);
  }, []);

  return (
    <DemoContext.Provider
      value={{
        isDemoMode,
        demoData,
        isLoadingDemo,
        demoError,
        loadDemoData,
        clearDemoData,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (context === undefined) {
    throw new Error("useDemo must be used within a DemoProvider");
  }
  return context;
}
