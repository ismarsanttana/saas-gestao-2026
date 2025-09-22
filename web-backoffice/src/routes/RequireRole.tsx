import { Navigate } from 'react-router-dom';
import { useAuth } from '../stores/authStore';
import { canUseProfessor } from '../router/guards';

export function RequireRole({
  papel,
  slug,
  children
}: {
  papel?: string;
  slug?: string;
  children: JSX.Element;
}) {
  const { user, has } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (papel) {
    const allowed =
      papel === 'PROFESSOR'
        ? canUseProfessor()
        : has(papel, slug);
    if (!allowed) return <Navigate to="/login" replace />;
  }

  return children;
}
