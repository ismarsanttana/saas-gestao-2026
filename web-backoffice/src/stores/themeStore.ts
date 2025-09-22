import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const applyThemeClass = (theme: Theme) => {
  if (typeof document === 'undefined') return;
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
};

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyThemeClass(theme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('theme', theme);
    }
    set({ theme });
  },
  toggle: () => {
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
      applyThemeClass(next);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('theme', next);
      }
      return { theme: next };
    });
  }
}));

// apply immediately when module loads
applyThemeClass(getInitialTheme());
