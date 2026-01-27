"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import {
  UserProfile,
  DEFAULT_USER_PROFILE,
  USER_PROFILE_STORAGE_KEY,
} from "@/lib/types/userProfile";

interface PersonaContextValue {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  hasProfile: boolean;
}

const PersonaContext = createContext<PersonaContextValue | undefined>(undefined);

// Helper to load profile from localStorage (runs once during initialization)
function getInitialProfile(): { profile: UserProfile; hasProfile: boolean } {
  if (typeof window === "undefined") {
    return { profile: DEFAULT_USER_PROFILE, hasProfile: false };
  }

  const saved = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        profile: { ...DEFAULT_USER_PROFILE, ...parsed },
        hasProfile: true
      };
    } catch {
      // Ignore parse errors
    }
  }
  return { profile: DEFAULT_USER_PROFILE, hasProfile: false };
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  // Initialize state from localStorage using lazy initialization
  const [{ profile, hasProfile }, setProfileData] = useState(() => getInitialProfile());

  const setProfile = useCallback((newProfile: UserProfile) => {
    setProfileData({ profile: newProfile, hasProfile: true });
    if (typeof window !== "undefined") {
      localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(newProfile));
    }
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfileData((prev) => {
      const updated = { ...prev.profile, ...updates };
      if (typeof window !== "undefined") {
        localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(updated));
      }
      return { profile: updated, hasProfile: true };
    });
  }, []);

  return (
    <PersonaContext.Provider
      value={{
        profile,
        setProfile,
        updateProfile,
        hasProfile,
      }}
    >
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  const context = useContext(PersonaContext);
  if (context === undefined) {
    throw new Error("usePersona must be used within a PersonaProvider");
  }
  return context;
}
