import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../types/database";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  initialized: boolean;
  setAuth: (session: Session | null, profile: Profile | null) => void;
  setInitialized: (initialized: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  initialized: false,
  setAuth: (session, profile) => set({ session, profile }),
  setInitialized: (initialized) => set({ initialized }),
  clear: () => set({ session: null, profile: null }),
}));
