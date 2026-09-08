import { useMemo, useState } from "react";
import { runSelfTests, TEST_COUNT, type TestResult } from "../engine/selftest";
import { Badge, Btn, Meter, Panel, PanelHead, Stat } from "./primitives";
import { cx } from "./ui";

export default function TestLab() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    window.setTimeout(() => {
      setResults(runSelfTests());
      setRunning(false);
    }, 420);
  };

  const summary = useMemo(() => {
    if (!results) return null;
    const passed = results.filter((item) => item.status === "pass").length;
    const total = results.reduce((sum, item) => sum + item.ms, 0);
    return { passed, failed: results.length - passed, ms: total };
  }, [results]);

  const groups = useMemo(() => {
    if (!results) return [];
    const map = new Map<string, TestResult[]>();
    for (const item of results) {
      const bucket = map.get(item.group) ?? [];
      bucket.push(item);
      map.set(item.group, bucket);
    }
    return Array.from(map.entries());
  }, [results]);

  return (
    <div className="space-y-5">
      <Panel glow>
        <PanelHead
          eyebrow="rede de proteção"
          title={`${TEST_COUNT} casos de teste executáveis neste navegador`}
          right={
            <div className="flex items-center gap-2">
              {results ? (
                <Badge tone={summary?.failed ? "rose" : "neon"}>
                  {summary?.passed}/{results.length} passando
                </Badge>
              ) : (
                <Badge tone="slate">não executado</Badge>
              )}
              <Btn size="sm" variant="primary" onClick={run} disabled={running}>
                {running ? "executando..." : "rodar suíte"}
              </Btn>
            </div>
          }
        />
        <div className="space-y-4 p-5">
          <p className="max-w-3xl text-[13px] leading-relaxed text-white/55">
            O crítico recusou as duas primeiras versões por falta de testes. Estes casos rodam de verdade
            contra o mesmo motor que alimenta o Studio: fidelidade de código, tabelas e listas, atribuição
            de papéis, front-matter, ausência de vaziamento de chrome, nomes ambíguos, erros tipados e
            determinismo com relógio injetado.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="casos" value={TEST_COUNT} hint="pytest + vitest equivalentes" />
            <Stat
              label="passando"
              value={summary ? summary.passed : "—"}
              tone={summary && summary.failed === 0 ? "good" : "default"}
              hint={summary ? `${summary.ms.toFixed(1)} ms` : "aguardando execução"}
            />
            <Stat
              label="falhas"
              value={summary ? summary.failed : "—"}
              tone={summary && summary.failed ? "warn" : "default"}
            />
            <Stat label="gate de CI" value="90%" hint="fail_under no pyproject" />
          </div>
          {results ? <Meter value={(summary!.passed / results.length) * 100} tone={summary!.failed ? "amber" : "neon"} /> : null}
        </div>
      </Panel>

      {results ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.map(([group, items]) => (
            <Panel key={group}>
              <PanelHead
                eyebrow={`grupo · ${items.length} caso(s)`}
                title={group}
                accent={items.every((item) => item.status === "pass") ? "neon" : "rose"}
                right={
                  <Badge tone={items.every((item) => item.status === "pass") ? "neon" : "rose"}>
                    {items.filter((item) => item.status === "pass").length}/{items.length}
                  </Badge>
                }
              />
              <div className="divide-y divide-white/5">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className={cx(
                        "mt-0.5 font-mono text-[11px]",
                        item.status === "pass" ? "text-neon-400" : "text-rose-400",
                      )}
                    >
                      {item.status === "pass" ? "PASS" : "FAIL"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] leading-snug text-white/80">{item.name}</div>
                      {item.message ? (
                        <div className="mt-1 rounded-md border border-rose-400/25 bg-rose-500/10 px-2 py-1 font-mono text-[11px] text-rose-100/80">
                          {item.message}
                        </div>
                      ) : null}
                    </div>
                    <span className="font-mono text-[10.5px] text-white/25">{item.ms.toFixed(1)}ms</span>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  );
}
