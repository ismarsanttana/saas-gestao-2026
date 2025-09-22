import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Moon,
  NotebookPen,
  PenSquare,
  School,
  Sparkles,
  Sun,
  Users,
  X
} from 'lucide-react';

import { requireProfessor } from '../router/guards';
import { useAuth } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { clearSession } from '../auth/session';
import { apiFetch } from '../api/client';
import { ProfileMenu } from '../components/prof/ProfileMenu';

type SidebarLinkConfig = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

const SIDEBAR_LINKS: SidebarLinkConfig[] = [
  { to: '/prof', label: 'Painel do Professor', icon: LayoutDashboard },
  { to: '/prof/chamada', label: 'Registro de Aula', icon: ClipboardList },
  { to: '/prof/avaliacoes', label: 'Construtor de Provas', icon: PenSquare },
  { to: '/prof/planejamento', label: 'Planejamento pedagógico', icon: NotebookPen },
  { to: '/prof/atividades-extras', label: 'Atividades Extras', icon: Sparkles, badge: 'Em breve' },
  { to: '/prof/materiais', label: 'Material Didático', icon: BookOpen },
  { to: '/prof/cursos-formacao', label: 'Cursos de Formação', icon: GraduationCap, badge: 'Em breve' },
  { to: '/prof/notas', label: 'Lançar notas finais', icon: CheckSquare },
  { to: '/prof/alunos', label: 'Meus Alunos', icon: Users },
  { to: '/prof/relatorios', label: 'Boletim Escolar', icon: School }
];

type SidebarLink = (typeof SIDEBAR_LINKS)[number];

const TOP_NAV_LINKS = [
  { to: '/prof', label: 'Início' },
  { to: '/prof/chamada', label: 'Chamada' },
  { to: '/prof/avaliacoes', label: 'Avaliações' },
  { to: '/prof/planejamento', label: 'Planejamento' },
  { to: '/prof/notas', label: 'Notas' },
  { to: '/prof/materiais', label: 'Materiais' },
  { to: '/prof/turmas', label: 'Turmas vinculadas' },
  { to: '/prof/alunos', label: 'Meus alunos' },
  { to: '/prof/agenda', label: 'Agenda' },
  { to: '/prof/relatorios', label: 'Relatórios' }
] as const;

export function ProfessorShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth((state) => state.user);
  const clearAuth = useAuth((state) => state.clear);
  const [allowed, setAllowed] = useState(false);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 768;
  });

  useEffect(() => {
    requireProfessor(
      () => setAllowed(true),
      () => {
        setAllowed(false);
        navigate('/login', { replace: true });
      }
    );
  }, [user, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateLayout = () => {
      setIsDesktop(window.innerWidth >= 768);
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && headerRef.current) {
      observer = new ResizeObserver(() => updateLayout());
      observer.observe(headerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateLayout);
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  if (!allowed) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      // ignore
    }
    clearAuth();
    clearSession();
    navigate('/login', { replace: true });
  };

  const isLight = theme === 'light';
  const activeLink = resolveActiveLink(location.pathname);
  const sidebarWidth = isDesktop ? (isSidebarCollapsed ? 80 : 288) : 0;
  const contentOffsetStyle = sidebarWidth
    ? {
        marginLeft: sidebarWidth
      }
    : undefined;

  return (
    <div className={`flex min-h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'}`}>
      <DesktopSidebar
        collapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
        isLight={isLight}
        onNavigate={() => setIsMobileMenuOpen(false)}
        headerHeight={headerHeight}
      />

      <div
        className="flex min-h-screen flex-1 flex-col transition-[margin-left] duration-300 ease-in-out"
        style={contentOffsetStyle}
      >
        <header
          ref={headerRef}
          className={`fixed top-0 left-0 right-0 z-40 border-b backdrop-blur transition-colors ${
            isLight
              ? 'border-slate-200 bg-white/80 text-slate-900'
              : 'border-slate-900 bg-slate-950/80 text-slate-100'
          }`}
        >
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 md:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold md:hidden ${
                    isLight
                      ? 'border-slate-200 bg-white/60 text-slate-900'
                      : 'border-slate-800 bg-slate-900/80 text-slate-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(true)}
                  aria-label="Abrir menu"
                >
                  <Menu size={18} />
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-400/80">Painel do professor</p>
                  <h1 className="text-lg font-semibold md:text-xl">{activeLink?.label ?? 'Visão geral'}</h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border text-sm transition ${
                    isLight
                      ? 'border-slate-200 bg-white/70 text-slate-700 hover:border-emerald-500/40 hover:text-emerald-600'
                      : 'border-slate-800 bg-slate-900/80 text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200'
                  }`}
                  aria-label={isLight ? 'Ativar tema escuro' : 'Ativar tema claro'}
                >
                  {isLight ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <ProfileMenu onSignOut={handleSignOut} theme={theme} />
              </div>
            </div>

            <nav
              className={`flex overflow-x-auto border-t px-4 pb-3 pt-2 md:px-6 ${
                isLight
                  ? 'border-slate-200/80 text-slate-600'
                  : 'border-slate-800/80 text-slate-200'
              }`}
              aria-label="Navegação rápida do professor"
            >
              <div className="flex w-full min-w-max gap-2">
                {TOP_NAV_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/prof'}
                    className={({ isActive }) =>
                      `whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition md:text-sm ${
                        isActive
                          ? isLight
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                            : 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-sm'
                          : isLight
                          ? 'border-transparent text-slate-500 hover:border-emerald-400/40 hover:bg-emerald-50 hover:text-emerald-700'
                          : 'border-transparent text-slate-400 hover:border-emerald-500/40 hover:bg-slate-900 hover:text-white'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </nav>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto" style={{ marginTop: headerHeight }}>
          <div className="px-4 py-6 md:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      {isMobileMenuOpen && (
        <MobileSidebar
          onClose={() => setIsMobileMenuOpen(false)}
          isLight={isLight}
          onNavigate={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}

function DesktopSidebar({
  collapsed,
  onToggle,
  isLight,
  onNavigate,
  headerHeight
}: {
  collapsed: boolean;
  onToggle: () => void;
  isLight: boolean;
  onNavigate: () => void;
  headerHeight: number;
}) {
  const topOffset = Math.max(0, headerHeight);
  return (
    <aside
      className={`fixed left-0 hidden md:flex md:flex-col ${
        collapsed ? 'md:w-20' : 'md:w-72'
      } border-r transition-all duration-300 ${
        isLight
          ? 'border-slate-200 bg-white/90 text-slate-800'
          : 'border-slate-900 bg-slate-950/95 text-slate-100'
      } backdrop-blur z-30`}
      style={{ top: topOffset, height: `calc(100vh - ${topOffset}px)` }}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6 pt-6">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-emerald-950">
              GZ
            </div>
            {!collapsed && (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-400/80">Gestão</p>
                <h2 className="text-sm font-semibold">Zabelê Educação</h2>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`hidden h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold md:inline-flex ${
              isLight
                ? 'border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-500'
                : 'border-slate-800 text-slate-300 hover:border-emerald-500/60 hover:text-emerald-200'
            }`}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="mt-4 flex-1 space-y-1">
          {SIDEBAR_LINKS.map((link) => (
            <SidebarLinkItem
              key={link.to}
              link={link}
              collapsed={collapsed}
              isLight={isLight}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <p
          className={`text-xs leading-relaxed ${
            collapsed ? 'text-center' : ''
          } ${isLight ? 'text-slate-400' : 'text-slate-500'}`}
        >
          {collapsed
            ? '2025'
            : 'Versão 2025 — Plataforma integrada para professores e secretaria.'}
        </p>
      </div>
    </aside>
  );
}

function SidebarLinkItem({
  link,
  collapsed,
  isLight,
  onNavigate
}: {
  link: SidebarLink;
  collapsed: boolean;
  isLight: boolean;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      to={link.to}
      end={link.to === '/prof'}
      onClick={onNavigate}
      title={collapsed ? link.label : undefined}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
          isActive
            ? isLight
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-emerald-500/20 text-emerald-200'
            : isLight
            ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            : 'text-slate-300 hover:bg-slate-900 hover:text-white'
        } ${collapsed ? 'justify-center px-2' : ''}`
      }
    >
      <link.icon className="h-5 w-5" />
      {!collapsed && (
        <span className="flex-1">
          {link.label}
          {link.badge && (
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              {link.badge}
            </span>
          )}
        </span>
      )}
    </NavLink>
  );
}

function MobileSidebar({
  onClose,
  isLight,
  onNavigate
}: {
  onClose: () => void;
  isLight: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur" onClick={onClose} />
      <div
        className={`absolute inset-y-0 left-0 w-80 max-w-[80vw] overflow-y-auto border-r px-4 pb-6 pt-6 shadow-2xl transition ${
          isLight
            ? 'border-slate-200 bg-white text-slate-900'
            : 'border-slate-900 bg-slate-950 text-slate-100'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-400/80">Gestão</p>
            <h2 className="text-lg font-semibold">Zabelê Educação</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold ${
              isLight
                ? 'border-slate-200 text-slate-600'
                : 'border-slate-800 text-slate-200'
            }`}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="space-y-1">
          {SIDEBAR_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/prof'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? isLight
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-emerald-500/20 text-emerald-200'
                    : isLight
                    ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`
              }
            >
              <link.icon className="h-5 w-5" />
              <span className="flex-1">
                {link.label}
                {link.badge && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                    {link.badge}
                  </span>
                )}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function resolveActiveLink(pathname: string): SidebarLink | undefined {
  if (pathname === '/prof') {
    return SIDEBAR_LINKS[0];
  }
  return SIDEBAR_LINKS.find((link) => pathname.startsWith(link.to));
}
