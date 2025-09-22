import { useAuth } from '../stores/authStore';

export function canUseProfessor(): boolean {
  return useAuth.getState().has('PROFESSOR');
}

export function requireProfessor(next: () => void, fallback: () => void) {
  if (canUseProfessor()) {
    next();
  } else {
    fallback();
  }
}
