import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';
import { bootstrapSession, useSession } from './auth/session';

export default function App() {
  const session = useSession();

  useEffect(() => {
    bootstrapSession();
  }, []);

  return (
    <Routes>
      <Route
        path="/login"
        element={session.user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const session = useSession();

  if (!session.initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-lg bg-white px-6 py-4 shadow">Carregando…</div>
      </div>
    );
  }

  if (!session.user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
