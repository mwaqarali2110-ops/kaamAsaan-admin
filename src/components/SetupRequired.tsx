import { FiKey, FiServer } from "react-icons/fi";

export function SetupRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <section className="panel max-w-xl p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-solar-soft text-2xl text-amber-600">
          <FiKey />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-ink">Connect Supabase to continue</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The admin dashboard is ready, but its environment variables are missing. Add your Supabase project URL and anon key, then restart the development server.
        </p>
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left font-mono text-xs leading-6 text-slate-700">
          <div>VITE_SUPABASE_URL=</div>
          <div>VITE_SUPABASE_ANON_KEY=</div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-leaf">
          <FiServer /> Uses the anon key with database RLS policies
        </div>
      </section>
    </main>
  );
}
