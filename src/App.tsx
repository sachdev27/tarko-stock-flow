import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Production from "./pages/Production";
import Inventory from "./pages/InventoryNew";
import Transactions from "./pages/TransactionsNew";
import Dispatch from "./pages/Dispatch";
import Return from "./pages/Return";
import Reports from "./pages/Reports";
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
              path="/returns"
              element={
                <ProtectedRoute requireUser>
                  <Return />
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
            {/* Redirect old return routes to new unified route */}
            <Route path="/returns/new" element={<Navigate to="/returns" replace />} />
            <Route path="/returns/history" element={<Navigate to="/returns" replace />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
