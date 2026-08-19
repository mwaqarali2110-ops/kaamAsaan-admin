import { Navigate, Outlet } from "react-router-dom";
import { LoadingState } from "../components/AsyncState";
import { useAuthStore } from "../store/useAuthStore";

export function ProtectedRoute() {
  const { initialized, session, profile } = useAuthStore();

  if (!initialized) return <div className="min-h-screen bg-canvas"><LoadingState label="Checking admin access..." /></div>;
  if (!session || profile?.role !== "admin") return <Navigate to="/login" replace />;
  return <Outlet />;
}
