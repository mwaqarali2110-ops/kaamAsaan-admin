import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FiArrowRight, FiLock, FiMail, FiShield } from "react-icons/fi";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { errorMessage } from "../../lib/utils";
import { useAuthStore } from "../../store/useAuthStore";
import { signIn } from "./auth.service";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(6, "Password must contain at least 6 characters."),
});

type Values = z.infer<typeof schema>;

export function LoginPage() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { session, profile, setAuth } = useAuthStore();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  if (session && profile?.role === "admin") return <Navigate to="/" replace />;

  async function onSubmit(values: Values) {
    setError("");
    try {
      const auth = await signIn(values.email, values.password);
      setAuth(auth.session, auth.profile);
      navigate("/", { replace: true });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="text-xl font-black">
          <span className="text-solar">Kaam</span>Asaan
        </div>
        <div className="max-w-xl">
          <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-solar">
            SOLAR OPERATIONS
          </div>
          <h1 className="mt-5 text-5xl font-black leading-tight">
            Run the marketplace with clarity.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
            Manage products, bookings, customers, and system data from one
            focused operations console.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <FiShield className="text-solar" /> Protected by Supabase Auth and RLS
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden">
            <div className="text-xl font-black">
              <span className="text-solar">Kaam</span>Asaan
            </div>
          </div>
          <div className="panel mt-6 p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-solar-soft text-xl text-amber-600">
              <FiLock />
            </div>
            <h1 className="mt-5 text-2xl font-extrabold text-ink">
              Admin sign in
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Use your approved KaamAsaan administrator account.
            </p>
            {error && (
              <div className="mt-5 rounded-md border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                {error}
              </div>
            )}
            <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <label className="block text-sm font-bold text-ink">
                Email
                <div className="relative mt-2">
                  <FiMail className="absolute left-3 top-3 text-slate-400" />
                  <input
                    className="field pl-10"
                    type="email"
                    placeholder="admin@kaamasaan.pk"
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <span className="mt-1 block text-xs text-red-600">
                    {errors.email.message}
                  </span>
                )}
              </label>
              <label className="block text-sm font-bold text-ink">
                Password
                <div className="relative mt-2">
                  <FiLock className="absolute left-3 top-3 text-slate-400" />
                  <input
                    className="field pl-10"
                    type="password"
                    placeholder="Your password"
                    {...register("password")}
                  />
                </div>
                {errors.password && (
                  <span className="mt-1 block text-xs text-red-600">
                    {errors.password.message}
                  </span>
                )}
              </label>
              <button className="btn-primary w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"} <FiArrowRight />
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
