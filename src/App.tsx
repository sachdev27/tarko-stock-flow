import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/DashboardNew";
import Production from "./pages/ProductionNew";
import Inventory from "./pages/InventoryNew";
import Transactions from "./pages/TransactionsNew";
import Dispatch from "./pages/DispatchNewModular";
import Reports from "./pages/ReportsNew";
import Admin from "./pages/Admin";
import Details from "./pages/Details";
import ExportHDPE from "./pages/ExportHDPE";
import ExportSprinkler from "./pages/ExportSprinkler";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/production"
              element={
                <ProtectedRoute requireUser>
                  <Production />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedRoute>
                  <Inventory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/transactions"
              element={
                <ProtectedRoute requireUser>
                  <Transactions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dispatch"
              element={
                <ProtectedRoute requireUser>
                  <Dispatch />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/details"
              element={
                <ProtectedRoute requireUser>
                  <Details />
                </ProtectedRoute>
              }
            />
            <Route
              path="/export/hdpe"
              element={
                <ProtectedRoute>
                  <ExportHDPE />
                </ProtectedRoute>
              }
            />
            <Route
              path="/export/sprinkler"
              element={
                <ProtectedRoute>
                  <ExportSprinkler />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
