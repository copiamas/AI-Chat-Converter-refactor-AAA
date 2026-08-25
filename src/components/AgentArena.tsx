import { useCallback, useEffect, useMemo, useState } from "react";
import {
  APPROVAL_THRESHOLD,
  CERTIFICATE_FINGERPRINT,
  CRITERIA,
  ROUNDS,
  conclude,
  isCriticApproved,
  overallScore,
} from "../agents/loop";
import { Badge, Btn, Meter, Panel, PanelHead } from "./primitives";
import { cx } from "./ui";

type Phase = "idle" | "implementer" | "critic" | "settled";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "aguardando",
  implementer: "AGENTE-IMPL escrevendo",
  critic: "AGENTE-CRIT revisando",
  settled: "ciclo encerrado",
};

export default function AgentArena() {
  const [executed, setExecuted] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [auto, setAuto] = useState(false);

  const step = useCallback(() => {
    setPhase("implementer");
    window.setTimeout(() => setPhase("critic"), 620);
    window.setTimeout(() => {
      setPhase("settled");
      setExecuted((current) => Math.min(ROUNDS.length, current + 1));
    }, 1500);
  }, []);

  useEffect(() => {
    if (!auto) return;
    if (executed >= ROUNDS.length) {
      setAuto(false);
      return;
    }
    const timer = window.setTimeout(step, 450);
    return () => window.clearTimeout(timer);
  }, [auto, executed, step]);

  const currentIndex = Math.max(0, executed - 1);
  const round = ROUNDS[currentIndex];
  const conclusion = useMemo(() => conclude(), []);
  const converged = executed >= ROUNDS.length && isCriticApproved(round.critic) && round.implementer.satisfied;

  const score = executed ? overallScore(round.critic.scores) : 0;
  const previousScore = executed > 1 ? overallScore(ROUNDS[currentIndex - 1].critic.scores) : null;

  return (
    <div className="space-y-5">
      {/* ── Control bar ─────────────────────────────────────────────── */}
      <Panel>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
              loop de engenharia
            </div>
            <h3 className="mt-1 text-[15px] font-semibold text-white">
              AGENTE-IMPL ⇄ AGENTE-CRIT
              <span className="ml-2 font-mono text-[11.5px] text-white/40">
                {executed}/{ROUNDS.length} ciclos
              </span>
            </h3>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-white/45">
              Regra de parada explícita:{" "}
              <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[11px] text-neon-400">
                {conclusion.stoppingRule}
              </code>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={phase === "idle" ? "slate" : phase === "implementer" ? "violet" : "neon"}>
              {PHASE_LABEL[phase]}
            </Badge>
            <Btn size="sm" variant="outline" onClick={() => { setExecuted(0); setPhase("idle"); }}>
              reiniciar
            </Btn>
            <Btn
              size="sm"
              variant="outline"
              onClick={() => setAuto(true)}
              disabled={auto || executed >= ROUNDS.length}
            >
              rodar até convergir
            </Btn>
            <Btn size="sm" variant="primary" onClick={step} disabled={auto || executed >= ROUNDS.length}>
              {executed === 0 ? "executar 1º ciclo" : "próximo ciclo"}
            </Btn>
          </div>
        </div>

        <div className="flex gap-1 border-t border-white/8 px-4 py-2.5">
          {ROUNDS.map((item, index) => {
            const done = index < executed;
            return (
              <div key={item.round} className="flex flex-1 items-center gap-2">
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-white/35">
                    <span>ciclo {item.round}</span>
                    <span className={done ? "text-neon-400" : ""}>{done ? overallScore(item.critic.scores) : "—"}</span>
                  </div>
                  <Meter
                    value={done ? overallScore(item.critic.scores) : 2}
                    tone={done && isCriticApproved(item.critic) ? "neon" : done ? "amber" : "violet"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ── Agents ──────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className={cx("transition", phase === "implementer" && "ring-1 ring-violet-400/50")}>
          <PanelHead
            eyebrow="agent 01 · implementador"
            title="AGENTE-IMPL"
            accent="violet"
            right={
              <Badge tone={executed && round.implementer.satisfied ? "neon" : executed ? "amber" : "slate"}>
                {!executed ? "aguardando" : round.implementer.satisfied ? "satisfeito" : "insatisfeito"}
              </Badge>
            }
          />
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.06] p-4">
              <div className="font-mono text-[10.5px] uppercase tracking-widest text-violet-300/70">
                {round.implementer.version}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/80">
                {executed
                  ? round.implementer.headline
                  : "O implementador só entrega código depois que o crítico define os bloqueios do ciclo anterior. Ciclo 1 parte do porte direto do legado."}
              </p>
            </div>

            <ul className={cx("space-y-2", !executed && "pointer-events-none opacity-35")}>
              {round.implementer.notes.map((note) => (
                <li key={note} className="flex gap-2.5 text-[12.5px] leading-relaxed text-white/60">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>

            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                artefatos entregues
              </div>
              <div className="flex flex-wrap gap-1.5">
                {round.implementer.artifacts.map((artifact) => (
                  <span
                    key={artifact}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10.5px] text-white/55"
                  >
                    {artifact}
                  </span>
                ))}
              </div>
            </div>

            <p className="border-t border-white/8 pt-3 text-[12px] italic text-white/45">
              “{round.implementer.handoff}”
            </p>
          </div>
        </Panel>

        <Panel className={cx("transition", phase === "critic" && "ring-1 ring-rose-400/50")}>
          <PanelHead
            eyebrow="agent 02 · crítico"
            title="AGENTE-CRIT"
            accent="rose"
            right={
              <Badge
                tone={
                  !executed
                    ? "slate"
                    : round.critic.verdict === "APROVADO"
                      ? "neon"
                      : round.critic.verdict === "REPROVADO"
                        ? "rose"
                        : "amber"
                }
              >
                {executed ? round.critic.verdict : "sem parecer"}
              </Badge>
            }
          />
          <div className="space-y-4 p-5">
            <div className="flex items-end gap-4">
              <div>
                <div className="font-mono text-4xl font-bold text-white">{executed ? score : "—"}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">score ponderado</div>
              </div>
              {previousScore !== null ? (
                <div className="mb-1 font-mono text-[12px] text-neon-400">
                  +{score - previousScore} vs. ciclo {currentIndex}
                </div>
              ) : null}
              <div className="mb-1 ml-auto text-right font-mono text-[10.5px] text-white/35">
                gate: ≥ {APPROVAL_THRESHOLD} em todos
              </div>
            </div>
            <Meter value={score} tone={score >= APPROVAL_THRESHOLD ? "neon" : "amber"} />

            <p className="text-[12.5px] leading-relaxed text-white/60">
              {executed
                ? round.critic.rationale
                : "Rubrica de 9 critérios ponderados. O parecer do ciclo 1 reprovou o porte direto do legado com 7 bloqueios — o primeiro deles, a perda estrutural causada por get_text()."}
            </p>

            {!executed ? null : round.critic.blocking.length ? (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-300/70">
                  bloqueios ({round.critic.blocking.length})
                </div>
                {round.critic.blocking.map((issue) => (
                  <div
                    key={issue}
                    className="rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-rose-50/85"
                  >
                    {issue}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-neon-400/25 bg-neon-400/[0.07] px-3 py-2 text-[12px] text-neon-100/85">
                Nenhum bloqueio restante — aprovado.
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                recomendações não-bloqueantes
              </div>
              {round.critic.advisory.map((item) => (
                <div key={item} className="text-[12px] leading-relaxed text-white/45">
                  · {item}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Rubric ──────────────────────────────────────────────────── */}
      <Panel>
        <PanelHead
          eyebrow="rubrica ponderada"
          title={`${CRITERIA.length} critérios · peso total ${CRITERIA.reduce((sum, c) => sum + c.weight, 0)}`}
          right={<Badge tone="neon">evolução por ciclo</Badge>}
        />
        <div className="divide-y divide-white/5">
          {CRITERIA.map((criterion) => {
            const current = round.critic.scores[criterion.id] ?? 0;
            return (
              <div key={criterion.id} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,260px)_1fr_auto]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-white">{criterion.label}</span>
                    <span className="font-mono text-[10.5px] text-white/30">peso {criterion.weight}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-white/40">{criterion.detail}</p>
                </div>
                <div className="flex items-center gap-1">
                  {ROUNDS.map((item, index) => {
                    const value = item.critic.scores[criterion.id] ?? 0;
                    const visible = index < executed;
                    return (
                      <div key={item.round} className="flex-1">
                        <div className="h-8 w-full overflow-hidden rounded-md bg-white/[0.04]">
                          <div
                            className={cx(
                              "flex h-full items-end justify-center pb-0.5 font-mono text-[9.5px] transition-all duration-700",
                              value >= APPROVAL_THRESHOLD ? "bg-neon-400/25 text-neon-400" : "bg-amber-400/15 text-amber-300",
                            )}
                            style={{ height: visible ? `${Math.max(14, value)}%` : "6%" }}
                          >
                            {visible ? value : ""}
                          </div>
                        </div>
                        <div className="mt-1 text-center font-mono text-[9.5px] text-white/25">C{item.round}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-2 sm:w-24">
                  <span
                    className={cx(
                      "font-mono text-sm font-bold",
                      current >= APPROVAL_THRESHOLD ? "text-neon-400" : "text-amber-300",
                      !executed && "opacity-30",
                    )}
                  >
                    {executed ? current : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ── Certificate ─────────────────────────────────────────────── */}
      {converged ? (
        <Panel glow className="border-neon-400/30">
          <div className="flex flex-wrap items-center gap-6 px-6 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neon-400/15 text-3xl">
              ✅
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neon-400/70">
                certificado de convergência
              </div>
              <h4 className="mt-1 text-lg font-bold text-white">
                Loop encerrado após {conclusion.rounds} ciclos — score final {conclusion.finalScore}/100
              </h4>
              <p className="mt-1 text-[12.5px] text-white/50">
                AGENTE-CRIT: <strong className="text-neon-400">APROVADO</strong> · AGENTE-IMPL:{" "}
                <strong className="text-neon-400">satisfeito</strong> · nenhuma condição de continuidade restante.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-[11px] text-white/50">
              <div>fp: {CERTIFICATE_FINGERPRINT}</div>
              <div className="mt-1 text-neon-400/80">status: CONVERGED</div>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
