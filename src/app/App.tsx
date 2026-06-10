import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BrandsPage } from "../features/brands/BrandsPage";
import { BookingsPage } from "../features/bookings/BookingsPage";
import { CompatibilityPage } from "../features/compatibility/CompatibilityPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LoginPage } from "../features/auth/LoginPage";
import { ProductsPage } from "../features/products/ProductsPage";
import { ProductPriceManagerPage } from "../features/price-manager/ProductPriceManagerPage";
import { SmartToolsPage } from "../features/smart-tools/SmartToolsPage";
import { UsersPage } from "../features/users/UsersPage";
import { ProtectedRoute } from "../routes/ProtectedRoute";

export function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<ProtectedRoute />}><Route element={<AppShell />}><Route index element={<DashboardPage />} /><Route path="/products" element={<ProductsPage />} /><Route path="/products/price-manager" element={<ProductPriceManagerPage />} /><Route path="/admin/products/price-manager" element={<ProductPriceManagerPage />} /><Route path="/brands" element={<BrandsPage />} /><Route path="/users" element={<UsersPage />} /><Route path="/bookings" element={<BookingsPage />} /><Route path="/smart-tools" element={<SmartToolsPage />} /><Route path="/compatibility" element={<CompatibilityPage />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
