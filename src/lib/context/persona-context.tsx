"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
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

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [hasProfile, setHasProfile] = useState(false);

  // Load profile from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setProfileState({ ...DEFAULT_USER_PROFILE, ...parsed });
          setHasProfile(true);
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, []);

  const setProfile = useCallback((newProfile: UserProfile) => {
    setProfileState(newProfile);
    setHasProfile(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(newProfile));
    }
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfileState((prev) => {
      const updated = { ...prev, ...updates };
      if (typeof window !== "undefined") {
        localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(updated));
      }
      setHasProfile(true);
      return updated;
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
