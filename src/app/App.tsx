import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BrandsPage } from "../features/brands/BrandsPage";
import { BookingsPage } from "../features/bookings/BookingsPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LoginPage } from "../features/auth/LoginPage";
import { ProductsPage } from "../features/products/ProductsPage";
import { ProductPriceManagerPage } from "../features/price-manager/ProductPriceManagerPage";
import { SmartToolsPage } from "../features/smart-tools/SmartToolsPage";
import { UsersPage } from "../features/users/UsersPage";
import { PackageConfigurationPage } from "../features/package-configuration/PackageConfigurationPage";
import { ProtectedRoute } from "../routes/ProtectedRoute";
import { PremiumCarePage } from "../features/premium-care/PremiumCarePage";
import { RecommendationRulesPage } from "../features/recommendation-rules/RecommendationRulesPage";
import { PromoCodesPage } from "../features/promo-codes/PromoCodesPage";
import { AccessoriesPage } from "../features/accessories/AccessoriesPage";
import { EvChargersPage } from "../features/ev-chargers/EvChargersPage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { ServicePricingPage } from "../features/service-pricing/ServicePricingPage";

export function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<ProtectedRoute />}><Route element={<AppShell />}><Route index element={<DashboardPage />} /><Route path="/products" element={<ProductsPage />} /><Route path="/accessories" element={<AccessoriesPage />} /><Route path="/ev-chargers" element={<EvChargersPage />} /><Route path="/products/price-manager" element={<ProductPriceManagerPage />} /><Route path="/admin/products/price-manager" element={<ProductPriceManagerPage />} /><Route path="/brands" element={<BrandsPage />} /><Route path="/package-configuration" element={<PackageConfigurationPage />} /><Route path="/recommendation-rules" element={<RecommendationRulesPage />} /><Route path="/promo-codes" element={<PromoCodesPage />} /><Route path="/package-preview" element={<Navigate to="/package-configuration" replace />} /><Route path="/compatibility" element={<Navigate to="/package-configuration" replace />} /><Route path="/users" element={<UsersPage />} /><Route path="/bookings" element={<BookingsPage />} /><Route path="/orders" element={<OrdersPage />} /><Route path="/service-pricing" element={<ServicePricingPage />} /><Route path="/premium-care" element={<PremiumCarePage />} /><Route path="/smart-tools" element={<SmartToolsPage />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
