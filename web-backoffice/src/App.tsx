import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppRoutes } from './router';
import { useSession, bootstrapSession, clearSession as clearLegacySession } from './auth/session';
import { useAuth } from './stores/authStore';

export default function App() {
  const session = useSession();
  const navigate = useNavigate();
  const setAuth = useAuth((state) => state.setAuth);
  const clearAuth = useAuth((state) => state.clear);
  const inactivityTimer = useRef<number | null>(null);

  useEffect(() => {
    bootstrapSession();
  }, []);

  useEffect(() => {
    if (session.user) {
      setAuth(
        {
          id: session.user.id,
          nome: session.user.nome,
          email: session.user.email,
          secretarias:
            session.user.secretarias?.map((sec) => ({
              id: sec.id,
              nome: sec.nome,
              slug: sec.slug,
              papel: sec.papel as any
            })) ?? []
        },
        session.accessToken ?? null
      );
    }
  }, [session.user, session.accessToken, setAuth]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearAuth();
      clearLegacySession();
      navigate('/login', { replace: true });
    };
    window.addEventListener('app:unauthorized', onUnauthorized);
    return () => window.removeEventListener('app:unauthorized', onUnauthorized);
  }, [clearAuth, navigate]);

  useEffect(() => {
    if (!session.user) {
      if (inactivityTimer.current) {
        window.clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
      return () => {};
    }

    const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;

    const triggerLogout = () => {
      clearAuth();
      clearLegacySession();
      navigate('/login', { replace: true });
    };

    const resetTimer = () => {
      if (inactivityTimer.current) {
        window.clearTimeout(inactivityTimer.current);
      }
      inactivityTimer.current = window.setTimeout(triggerLogout, INACTIVITY_LIMIT_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'pointerdown',
      'click'
    ];

    activityEvents.forEach((event) => window.addEventListener(event, resetTimer, true));

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resetTimer();
      }
    };

    const handleFocus = () => resetTimer();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus, true);

    resetTimer();

    return () => {
      if (inactivityTimer.current) {
        window.clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer, true));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus, true);
    };
  }, [session.user, clearAuth, navigate]);

  return <AppRoutes />;
}
