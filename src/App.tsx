import { useState } from "react";
import AgentArena from "./components/AgentArena";
import CodeExplorer from "./components/CodeExplorer";
import Studio from "./components/Studio";
import TestLab from "./components/TestLab";
import { Badge } from "./components/primitives";
import { cx } from "./components/ui";

type TabId = "studio" | "agents" | "code" | "tests";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "studio", label: "Studio", hint: "conversor executando de verdade" },
  { id: "agents", label: "Agentes", hint: "implementador ⇄ crítico" },
  { id: "code", label: "Código", hint: "pacote aicli revisado" },
  { id: "tests", label: "Testes", hint: "suíte executável" },
];

const HIGHLIGHTS = [
  { label: "get_text() → extração semântica", tone: "neon" as const },
  { label: "erros tipados + exit codes", tone: "violet" as const },
  { label: "escrita atômica", tone: "neon" as const },
  { label: "encoding resiliente", tone: "violet" as const },
  { label: "16 testes executáveis", tone: "neon" as const },
  { label: "mypy --strict", tone: "violet" as const },
  { label: "confiança calibrada", tone: "neon" as const },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("studio");

  return (
    <div className="min-h-screen bg-ink-950 text-white">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none fixed inset-0 glow-aura" />

      <div className="relative">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="border-b border-white/8">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-neon-400 to-violet-500 text-ink-950">
                <span className="text-lg font-black">AI</span>
                <span className="absolute inset-0 animate-pulse-ring rounded-xl" />
              </div>
              <div>
                <div className="text-[13.5px] font-bold leading-tight tracking-tight">
                  AI Chat Converter <span className="text-white/35">/ refactor AAA</span>
                </div>
                <div className="font-mono text-[10.5px] text-white/35">
                  HTML salvo → Markdown limpo · v1.0.0
                </div>
              </div>
            </div>

            <nav className="order-3 flex flex-1 flex-wrap gap-1 sm:order-2 sm:justify-center">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cx(
                    "group rounded-lg px-3.5 py-2 text-left transition",
                    tab === item.id ? "bg-white/10" : "hover:bg-white/5",
                  )}
                >
                  <span
                    className={cx(
                      "block text-[12.5px] font-semibold",
                      tab === item.id ? "text-white" : "text-white/55 group-hover:text-white/80",
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="block text-[10px] text-white/30">{item.hint}</span>
                </button>
              ))}
            </nav>

            <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
              <Badge tone="neon">2 agentes</Badge>
              <Badge tone="violet">4 ciclos</Badge>
              <Badge tone="amber">96/100</Badge>
            </div>
          </div>
        </header>

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-[1400px] px-5 pt-10 sm:px-8">
          <div className="animate-rise">
            <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-neon-400/70">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-400" />
              processo de engenharia com dupla verificação
            </div>
            <h1 className="max-w-4xl text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-[42px]">
              Seu CLI de conversão, reescrito em{" "}
              <span className="bg-gradient-to-r from-neon-400 via-sky-300 to-violet-400 bg-clip-text text-transparent">
                nível AAA
              </span>{" "}
              — e provado por um crítico que não aprova por educação.
            </h1>
            <p className="mt-4 max-w-3xl text-[14.5px] leading-relaxed text-white/55">
              O script original funcionava para a conversa em que foi escrito. Aqui ele virou um pacote
              de seis estágios testáveis, com fidelidade de conteúdo garantida, papéis de autoria
              resolvidos por estratégia, encoding tolerante, escrita atômica, limites de segurança e uma
              suíte de testes que você mesmo roda abaixo. Tudo abaixo é executável: o Studio converte
              HTML de verdade no seu navegador.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {HIGHLIGHTS.map((item) => (
                <Badge key={item.label} tone={item.tone}>
                  {item.label}
                </Badge>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { before: "1 função, 6 responsabilidades", after: "6 estágios com contrato próprio" },
                { before: "get_text() destruía listas e código", after: "blocos semânticos em ordem de documento" },
                { before: "gatilhos fixos de 1 conversa", after: "metadados do DOM + heurística com histerese" },
                { before: "traceback cru no terminal", after: "ConversionError + exit codes 0..7" },
              ].map((item) => (
                <div key={item.before} className="panel rounded-xl p-4">
                  <div className="flex items-start gap-2 text-[12px] leading-snug text-rose-200/60 line-through decoration-rose-400/40">
                    {item.before}
                  </div>
                  <div className="mt-2 flex items-start gap-2 text-[12.5px] font-medium leading-snug text-white/85">
                    <span className="mt-0.5 text-neon-400">→</span>
                    {item.after}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <main className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
          <div key={tab} className="animate-rise">
            {tab === "studio" ? <Studio /> : null}
            {tab === "agents" ? <AgentArena /> : null}
            {tab === "code" ? <CodeExplorer /> : null}
            {tab === "tests" ? <TestLab /> : null}
          </div>
        </main>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer className="border-t border-white/8">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-5 py-6 text-[11.5px] text-white/35 sm:px-8">
            <span className="font-mono">
              AGENTE-IMPL ⇄ AGENTE-CRIT · halt somente com aprovação mútua
            </span>
            <span className="ml-auto font-mono">
              engine local · nenhum byte sai do navegador
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
