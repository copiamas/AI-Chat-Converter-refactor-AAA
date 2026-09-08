/// <reference path="../electron/types.d.ts" />
import { useCallback, useMemo, useRef, useState } from "react";
import {
  convertHtmlToMarkdown,
  ConversionError,
  type ConvertInput,
  type ConvertVerbose,
} from "../engine/convert";
import { FIXTURES } from "../engine/fixtures";
import { DEFAULT_OPTIONS } from "../engine/types";
import { Badge, Btn, Meter, Panel, PanelHead, Stat, Toggle } from "./primitives";
import { cx } from "./ui";
import { renderMarkdown } from "../lib/miniMd";

type ViewTab = "preview" | "turns" | "diag";

const PLATFORMS: { id: ConvertInput["platform"]; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "google-ai", label: "Google AI Mode" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "generic", label: "Genérico" },
];

export default function Studio() {
  const [html, setHtml] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [options, setOptions] = useState<ConvertInput>({ platform: "auto", locale: "pt-BR" });
  const [result, setResult] = useState<ConvertVerbose | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [tab, setTab] = useState<ViewTab>("preview");
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  void converting; // reserved for spinner UI

  const run = useCallback(
    async (source: string, name: string, opts: ConvertInput) => {
      if (!source.trim()) {
        setResult(null);
        setError(null);
        return;
      }
      setConverting(true);
      try {
        if (window.electronAPI) {
          const response = await window.electronAPI.convert({
            html: source,
            fileName: name || "conversa.html",
            options: opts,
          });
          const converted: ConvertVerbose = {
            markdown: response.markdown,
            outputName: response.outputName || (name || "conversa").replace(/\.html$/i, ".md"),
            fileName: name || "conversa.html",
            stats: {
              inputBytes: source.length,
              sanitizedElements: 0,
              noiseBlocksDropped: 0,
              blocksExtracted: 0,
              turns: 0,
              userTurns: 0,
              assistantTurns: 0,
              words: 0,
              chars: 0,
              durationMs: 0,
              roleSource: "mixed" as const,
              confidence: 1,
            },
            turns: [],
            stages: [{ id: "electron", label: "Electron IPC", detail: "Python engine via IPC" }],
            diagnostics: [],
            platform: (opts.platform === "google-ai" ? "google-ai" : opts.platform === "chatgpt" ? "chatgpt" : opts.platform === "generic" ? "generic" : "auto") as any,
            platformLabel: (opts.platform === "google-ai" ? "Google AI Mode" : opts.platform === "chatgpt" ? "ChatGPT" : opts.platform === "generic" ? "Generic" : "Auto"),
          };
          setResult(converted);
          setError(null);
        } else {
          const converted = convertHtmlToMarkdown(source, name || "conversa.html", opts);
          setResult(converted);
          setError(null);
        }
      } catch (caught) {
        setResult(null);
        if (caught instanceof ConversionError) {
          setError({ code: caught.code, message: caught.message });
        } else {
          const err = caught as { message?: string; code?: string };
          setError({ code: err.code || "UNEXPECTED", message: err.message || (caught as Error).message });
        }
      } finally {
        setConverting(false);
      }
    },
    [],
  );

  const load = useCallback(
    async (source: string, name: string) => {
      setHtml(source);
      setFileName(name);
      await run(source, name, options);
    },
    [options, run],
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => load(String(reader.result ?? ""), file.name);
      reader.onerror = () => setError({ code: "READ_FAILED", message: `Não foi possível ler ${file.name}.` });
      reader.readAsText(file, "utf-8");
    },
    [load],
  );

  const update = async (patch: ConvertInput) => {
    const next = { ...options, ...patch };
    setOptions(next);
    if (html) await run(html, fileName, next);
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.outputName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const preview = useMemo(() => (result ? renderMarkdown(result.markdown) : ""), [result]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      {/* ── Source & options ─────────────────────────────────────────── */}
      <div className="space-y-5">
        <Panel>
          <PanelHead eyebrow="entrada" title="Página HTML salva do chat" right={<Badge tone="neon">local</Badge>} />
          <div className="space-y-4 p-5">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                onFiles(event.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={cx(
                "cursor-pointer rounded-xl border border-dashed px-4 py-7 text-center transition",
                dragging ? "border-neon-400 bg-neon-400/10" : "border-white/15 hover:border-neon-400/50 hover:bg-white/[0.03]",
              )}
            >
              <div className="text-2xl">⬇️</div>
              <div className="mt-2 text-[13px] font-semibold text-white">Arraste o .html aqui</div>
              <div className="mt-1 text-[11.5px] text-white/40">
                Ctrl+S → “página completa”. Nada é enviado a servidor algum.
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(event) => onFiles(event.target.files)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                ou use um fixture do catálogo
              </div>
              {FIXTURES.map((fixture) => (
                <button
                  key={fixture.id}
                  type="button"
                  onClick={() => load(fixture.html, fixture.fileName)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition",
                    fileName === fixture.fileName
                      ? "border-neon-400/50 bg-neon-400/10"
                      : "border-white/8 hover:border-white/20 hover:bg-white/5",
                  )}
                >
                  <span className="mt-0.5 font-mono text-[11px] text-neon-400">{"{ }"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold text-white">{fixture.label}</span>
                    <span className="block text-[11px] leading-snug text-white/40">{fixture.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHead eyebrow="opções" title="Contrato de saída" accent="violet" />
          <div className="space-y-3 p-4">
            <div>
              <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                plataforma
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => update({ platform: platform.id })}
                    className={cx(
                      "rounded-lg border px-2 py-2 text-[11.5px] font-medium transition",
                      (options.platform ?? "auto") === platform.id
                        ? "border-violet-400/50 bg-violet-400/15 text-white"
                        : "border-white/8 text-white/50 hover:border-white/20",
                    )}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-0.5 pt-1">
              <Toggle
                checked={options.includeFrontMatter ?? DEFAULT_OPTIONS.includeFrontMatter}
                onChange={(next) => update({ includeFrontMatter: next })}
                label="Front-matter YAML"
                hint="title, date, time, platform, turns, generator"
              />
              <Toggle
                checked={options.includeTimestamp ?? true}
                onChange={(next) => update({ includeTimestamp: next })}
                label="Carimbo de exportação"
                hint="Linha em blockquote logo após o H1"
              />
              <Toggle
                checked={options.includeStatsFooter ?? true}
                onChange={(next) => update({ includeStatsFooter: next })}
                label="Rodapé com confiança"
                hint="Turnos, palavras e % de confiança da segmentação"
              />
              <Toggle
                checked={options.aggressiveNoiseFilter ?? true}
                onChange={(next) => update({ aggressiveNoiseFilter: next })}
                label="Filtro agressivo de chrome"
                hint="Remove rótulos de UI e boilerplate legal"
              />
            </div>

            <div className="flex gap-1.5 pt-1">
              {(["pt-BR", "en-US"] as const).map((locale) => (
                <button
                  key={locale}
                  type="button"
                  onClick={() => update({ locale })}
                  className={cx(
                    "flex-1 rounded-lg border px-2 py-1.5 font-mono text-[11px] transition",
                    (options.locale ?? "pt-BR") === locale
                      ? "border-neon-400/50 bg-neon-400/10 text-neon-400"
                      : "border-white/8 text-white/45 hover:border-white/20",
                  )}
                >
                  {locale}
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Output ───────────────────────────────────────────────────── */}
      <div className="space-y-5">
        {error ? (
          <Panel className="border-rose-400/30 bg-rose-500/5">
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <Badge tone="rose">{error.code}</Badge>
              <p className="min-w-0 flex-1 text-[13px] text-rose-100/85">{error.message}</p>
            </div>
          </Panel>
        ) : null}

        {!result && !error ? (
          <Panel className="flex min-h-[420px] items-center justify-center">
            <div className="max-w-md px-8 text-center">
              <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br from-neon-400/25 to-violet-500/25 p-[1px]">
                <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-ink-900 text-2xl">
                  🧹
                </div>
              </div>
              <h3 className="text-base font-semibold text-white">Pipeline pronto, aguardando entrada</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/50">
                Seis estágios determinísticos: ingestão → parse → sanitização → extração semântica →
                atribuição de papéis → renderização. O que o legado fazia com
                <code className="mx-1 rounded bg-white/10 px-1 font-mono text-[11.5px] text-rose-300">get_text()</code>
                agora preserva listas, tabelas e blocos de código.
              </p>
            </div>
          </Panel>
        ) : null}

        {result ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="turnos" value={result.stats.turns} hint={`${result.stats.userTurns}👤 / ${result.stats.assistantTurns}🤖`} />
              <Stat label="palavras" value={result.stats.words.toLocaleString("pt-BR")} hint={`${result.stats.chars.toLocaleString("pt-BR")} chars`} />
              <Stat
                label="chrome removido"
                value={result.stats.sanitizedElements}
                hint={`${result.stats.noiseBlocksDropped} bloco(s) descartado(s)`}
              />
              <Stat
                label="confiança"
                value={`${Math.round(result.stats.confidence * 100)}%`}
                tone={result.stats.confidence >= 0.9 ? "good" : "warn"}
                hint={`papéis: ${result.stats.roleSource}`}
              />
            </div>

            <Panel glow>
              <PanelHead
                eyebrow={`${result.platformLabel} · ${result.stats.durationMs.toFixed(1)} ms`}
                title={result.outputName}
                right={
                  <div className="flex items-center gap-2">
                    <Badge tone={result.stats.roleSource === "attributes" ? "neon" : "amber"}>
                      {result.stats.roleSource === "attributes" ? "metadados" : "heurístico"}
                    </Badge>
                    <Btn size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(result.markdown)}>
                      copiar
                    </Btn>
                    <Btn size="sm" variant="primary" onClick={download}>
                      baixar .md
                    </Btn>
                  </div>
                }
              />

              <div className="flex gap-1 border-b border-white/8 px-4 py-2">
                {(
                  [
                    ["preview", "Markdown renderizado"],
                    ["turns", `Turnos (${result.turns.length})`],
                    ["diag", `Diagnósticos (${result.diagnostics.length})`],
                  ] as [ViewTab, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cx(
                      "rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition",
                      tab === id ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "preview" ? (
                <div
                  className="md-surface max-h-[560px] overflow-y-auto px-6 py-5"
                  dangerouslySetInnerHTML={{ __html: preview }}
                />
              ) : null}

              {tab === "turns" ? (
                <div className="max-h-[560px] space-y-3 overflow-y-auto p-4">
                  {result.turns.map((turn) => (
                    <div
                      key={turn.index}
                      className={cx(
                        "rounded-xl border p-4",
                        turn.role === "user"
                          ? "border-sky-400/25 bg-sky-400/[0.06]"
                          : turn.role === "assistant"
                            ? "border-violet-400/25 bg-violet-400/[0.06]"
                            : "border-white/10 bg-white/[0.03]",
                      )}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge tone={turn.role === "user" ? "slate" : "violet"}>
                          {turn.role === "user" ? "👤 usuário" : turn.role === "assistant" ? "🤖 ia" : "⚙️ sistema"}
                        </Badge>
                        <span className="font-mono text-[10.5px] text-white/40">
                          bloco {turn.index + 1} · {turn.lines.length} bloco(s) ·{" "}
                          {Math.round(turn.confidence * 100)}%
                        </span>
                      </div>
                      <pre className="max-h-44 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-white/70">
                        {turn.lines.join("\n\n")}
                      </pre>
                      {turn.signals.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {turn.signals.map((signal) => (
                            <span
                              key={signal}
                              className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/35"
                            >
                              {signal}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "diag" ? (
                <div className="max-h-[560px] overflow-y-auto p-4">
                  <div className="mb-4 space-y-2">
                    {result.stages.map((stage, index) => (
                      <div key={stage.id} className="flex items-center gap-3 rounded-lg border border-white/8 px-3 py-2">
                        <span className="font-mono text-[10.5px] text-white/25">{String(index + 1).padStart(2, "0")}</span>
                        <span className="text-[12.5px] font-medium text-white/80">{stage.label}</span>
                        <span className="ml-auto truncate font-mono text-[11px] text-neon-400/70">{stage.detail}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {result.diagnostics.map((diagnostic, index) => (
                      <div
                        key={`${diagnostic.code}-${index}`}
                        className={cx(
                          "rounded-lg border px-3 py-2 text-[12px]",
                          diagnostic.level === "warn"
                            ? "border-amber-400/25 bg-amber-400/5 text-amber-100/80"
                            : diagnostic.level === "error"
                              ? "border-rose-400/25 bg-rose-400/5 text-rose-100/80"
                              : "border-white/8 bg-white/[0.02] text-white/60",
                        )}
                      >
                        <span className="mr-2 font-mono text-[10.5px] uppercase opacity-60">{diagnostic.level}</span>
                        <span className="mr-2 font-mono text-[10.5px] opacity-80">{diagnostic.code}</span>
                        {diagnostic.message}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[10.5px] uppercase tracking-[0.18em] text-white/35">
                      <span>índice de confiança</span>
                      <span>{Math.round(result.stats.confidence * 100)}%</span>
                    </div>
                    <Meter
                      value={result.stats.confidence * 100}
                      tone={result.stats.confidence >= 0.9 ? "neon" : "amber"}
                    />
                  </div>
                </div>
              ) : null}
            </Panel>
          </>
        ) : null}
      </div>
    </div>
  );
}
