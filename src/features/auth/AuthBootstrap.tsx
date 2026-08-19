import { useEffect, type PropsWithChildren } from "react";
import { fetchProfile } from "./auth.service";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/useAuthStore";

export function AuthBootstrap({ children }: PropsWithChildren) {
  const { setAuth, clear, setInitialized } = useAuthStore();

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;

      if (!session) {
        clear();
        setInitialized(true);
        return;
      }

      try {
        const profile = await fetchProfile(session);
        if (!active) return;
        if (profile.role !== "admin") {
          await supabase.auth.signOut();
          clear();
        } else {
          setAuth(session, profile);
        }
      } catch {
        clear();
      } finally {
        if (active) setInitialized(true);
      }
    }

    void hydrate();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clear();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [clear, setAuth, setInitialized]);

  return children;
}
