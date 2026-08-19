import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { Profile } from "../../types/database";

export async function fetchProfile(session: Session): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, city, role, created_at")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (!data.session) throw new Error("No active session was returned.");

  const profile = await fetchProfile(data.session);
  // if (profile.role !== "admin") {
  //   await supabase.auth.signOut();
  //   throw new Error("This account does not have admin dashboard access.");
  // }

  return { session: data.session, profile };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
