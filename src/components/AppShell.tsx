import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  FiActivity,
  FiBox,
  FiGrid,
  FiLayers,
  FiLogOut,
  FiMenu,
  FiDollarSign,
  FiShoppingBag,
  FiZap,
  FiUsers,
  FiX,
  FiShield,
  FiSliders,
  FiPercent,
} from "react-icons/fi";
import { useState } from "react";
import { signOut } from "../features/auth/auth.service";
import { useAuthStore } from "../store/useAuthStore";

const links = [
  { to: "/", label: "Overview", icon: FiGrid },
  { to: "/products", label: "Products", icon: FiShoppingBag },
  { to: "/accessories", label: "Accessories", icon: FiBox },
  { to: "/admin/products/price-manager", label: "Price Manager", icon: FiDollarSign },
  { to: "/brands", label: "Brands", icon: FiLayers },
  { to: "/package-configuration", label: "Package Management", icon: FiZap },
  { to: "/recommendation-rules", label: "Recommendation Rules", icon: FiSliders },
  { to: "/promo-codes", label: "Promo Codes", icon: FiPercent },
  { to: "/users", label: "Users", icon: FiUsers },
  { to: "/bookings", label: "Survey Bookings", icon: FiBox },
  { to: "/premium-care", label: "Premium Care", icon: FiShield },
  { to: "/smart-tools", label: "Smart Tools", icon: FiActivity },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { profile, clear } = useAuthStore();

  async function handleSignOut() {
    await signOut();
    clear();
    navigate("/login", { replace: true });
  }

  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-[#10233f] text-white">
      <div className="flex h-20 items-center justify-between px-5">
        <div>
          <div className="text-lg font-black tracking-tight"><span className="text-solar">Kaam</span>Asaan</div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Admin Console</div>
        </div>
        <button className="rounded-md p-2 text-slate-300 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close menu">
          <FiX />
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                isActive ? "bg-solar text-ink" : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <Icon /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3">
          <div className="text-sm font-bold">{profile?.full_name || "KaamAsaan Admin"}</div>
          <div className="text-xs text-slate-400">Administrator</div>
        </div>
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10" onClick={handleSignOut}>
          <FiLogOut /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>
      {menuOpen && <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden"><div className="h-full">{sidebar}</div></div>}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md border border-slate-200 p-2 text-ink lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <FiMenu />
          </button>
          <div className="hidden items-center gap-2 text-sm font-semibold text-slate-500 lg:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Supabase connected
          </div>
          <div className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-solar-soft text-xs font-black text-amber-700">
            {(profile?.full_name || "A").slice(0, 1).toUpperCase()}
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
