import { Info, Sparkles, Upload } from 'lucide-react';

import { useThemeStore } from '../../stores/themeStore';

export default function ProfessorAtividadesExtras() {
  const theme = useThemeStore((state) => state.theme);
  const isLight = theme === 'light';

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header
        className={`rounded-3xl border p-6 shadow ${
          isLight
            ? 'border-blue-100 bg-white text-slate-900'
            : 'border-slate-800 bg-slate-900/70 text-white'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Atividades Extras</h1>
            <p className={`mt-1 max-w-2xl text-sm ${isLight ? 'text-slate-500' : 'text-slate-300/90'}`}>
              Organize oficinas, projetos e atividades complementares para suas turmas. Registre propostas, acompanhe etapas e compartilhe materiais com os estudantes.
            </p>
          </div>
          <Sparkles className="h-10 w-10 text-emerald-400" />
        </div>
      </header>

      <section
        className={`rounded-2xl border p-6 shadow-inner ${
          isLight
            ? 'border-dashed border-blue-200 bg-blue-50/40 text-slate-700'
            : 'border-dashed border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        }`}
      >
        <div className="flex items-start gap-3">
          <Info className="mt-1 h-5 w-5" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide">Em breve</h2>
            <p className="mt-1 text-sm leading-relaxed opacity-90">
              Estamos finalizando a estrutura para lançamento de atividades extras com formulários personalizados, anexos e acompanhamento de entregas. Se tiver sugestões específicas, encaminhe à secretaria para priorizarmos.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div
          className={`rounded-2xl border p-5 shadow ${
            isLight
              ? 'border-blue-100 bg-white text-slate-800'
              : 'border-slate-800 bg-slate-900/70 text-white'
          }`}
        >
          <h3 className="text-lg font-semibold">Como vai funcionar</h3>
          <ul className={`mt-3 space-y-2 text-sm ${isLight ? 'text-slate-500' : 'text-slate-300/90'}`}>
            <li>• Cadastro rápido de atividades extracurriculares com descrição e objetivos.</li>
            <li>• Atribuição para turmas específicas ou grupos de alunos.</li>
            <li>• Linha do tempo para acompanhar andamento e evidências.</li>
          </ul>
        </div>
        <div
          className={`rounded-2xl border p-5 shadow ${
            isLight
              ? 'border-blue-100 bg-white text-slate-800'
              : 'border-slate-800 bg-slate-900/70 text-white'
          }`}
        >
          <h3 className="text-lg font-semibold">Prepare seus materiais</h3>
          <p className={`mt-3 text-sm ${isLight ? 'text-slate-500' : 'text-slate-300/90'}`}>
            Adiante-se organizando documentos, roteiros de atividades e listas de materiais. Em breve será possível anexar PDF, vídeos ou links de apoio diretamente aqui na plataforma.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-emerald-400/60 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            <Upload size={14} />
            Upload de arquivos estará disponível
          </div>
        </div>
      </section>
    </div>
  );
}
