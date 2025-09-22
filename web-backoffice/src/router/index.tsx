import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { LoginPage } from '../pages/Login';
import { SelectSecretariaPage } from '../pages/SelectSecretaria';
import { DashboardPage } from '../pages/Dashboard';
import ProfessorHome from '../pages/prof/index';
import ProfessorChamada from '../pages/prof/Chamada';
import ProfessorAvaliacoes from '../pages/prof/Avaliacoes';
import ProfessorNotas from '../pages/prof/Notas';
import ProfessorMateriais from '../pages/prof/Materiais';
import ProfessorAgenda from '../pages/prof/Agenda';
import ProfessorRelatorios from '../pages/prof/Relatorios';
import ProfessorTurmas from '../pages/prof/Turmas';
import ProfessorAtividadesExtras from '../pages/prof/AtividadesExtras';
import ProfessorCursosFormacao from '../pages/prof/CursosFormacao';
import ProfessorMeusAlunos from '../pages/prof/MeusAlunos';
import ProfessorPlanejamento from '../pages/prof/Planejamento';
import { ProfessorShell } from '../prof/ProfessorShell';
import { canUseProfessor } from './guards';
import { setActiveSecretariaBySlug, useSession } from '../auth/session';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const session = useSession();

  if (!session.initialized) {
    return <LoadingScreen />;
  }

  if (!session.user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function RootRedirect() {
  const session = useSession();

  if (!session.initialized) {
    return <LoadingScreen />;
  }

  if (!session.user) {
    return <Navigate to="/login" replace />;
  }

  if (!session.user.secretarias.length) {
    return <Navigate to="/select-secretaria" replace />;
  }

  if (session.user.secretarias.length === 1) {
    const [only] = session.user.secretarias;
    return <Navigate to={`/dashboard/${only.slug}`} replace />;
  }

  if (session.activeSecretaria) {
    return <Navigate to={`/dashboard/${session.activeSecretaria.slug}`} replace />;
  }

  return <Navigate to="/select-secretaria" replace />;
}

function DashboardRoute() {
  const { slug } = useParams<{ slug: string }>();
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (slug && setActiveSecretariaBySlug(slug) && !session.activeSecretaria) {
      navigate(`/dashboard/${slug}`, { replace: true });
    }
  }, [slug, session.activeSecretaria, navigate]);

  if (!slug) {
    return <Navigate to="/select-secretaria" replace />;
  }

  if (!session.activeSecretaria || session.activeSecretaria.slug !== slug) {
    const success = slug ? setActiveSecretariaBySlug(slug) : false;
    if (!success) {
      return <Navigate to="/select-secretaria" replace />;
    }
  }

  return <DashboardPage />;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="rounded-lg border border-slate-800 px-6 py-4">Carregando…</div>
    </div>
  );
}

function ProfessorGroup() {
  if (!canUseProfessor()) {
    return <Navigate to="/login" replace />;
  }

  return <ProfessorShell />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/select-secretaria"
        element={
          <ProtectedRoute>
            <SelectSecretariaPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/:slug"
        element={
          <ProtectedRoute>
            <DashboardRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/prof"
        element={
          <ProtectedRoute>
            <ProfessorGroup />
          </ProtectedRoute>
        }
      >
        <Route index element={<ProfessorHome />} />
        <Route path="chamada" element={<ProfessorChamada />} />
        <Route path="avaliacoes" element={<ProfessorAvaliacoes />} />
        <Route path="planejamento" element={<ProfessorPlanejamento />} />
        <Route path="atividades-extras" element={<ProfessorAtividadesExtras />} />
        <Route path="notas" element={<ProfessorNotas />} />
        <Route path="materiais" element={<ProfessorMateriais />} />
        <Route path="cursos-formacao" element={<ProfessorCursosFormacao />} />
        <Route path="turmas" element={<ProfessorTurmas />} />
        <Route path="alunos" element={<ProfessorMeusAlunos />} />
        <Route path="agenda" element={<ProfessorAgenda />} />
        <Route path="relatorios" element={<ProfessorRelatorios />} />
      </Route>
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
