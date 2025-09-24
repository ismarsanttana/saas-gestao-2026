import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import DashboardPage from "./pages/Dashboard";
import LoginPage from "./pages/Login";
import { useAuth } from "./state/auth";

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-shell">
        <header className="header">
          <strong>Urbanbyte • SaaS</strong>
        </header>
        <div className="container">
          <div className="card">Validando sessão...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
