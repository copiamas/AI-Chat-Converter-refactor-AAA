import type { ReactNode } from "react";
import { cx } from "./ui";

export function Panel({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <section
      className={cx(
        "panel relative rounded-2xl",
        glow && "shadow-[0_0_60px_-25px_rgba(62,232,200,0.45)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  eyebrow,
  title,
  right,
  accent = "neon",
}: {
  eyebrow?: string;
  title: ReactNode;
  right?: ReactNode;
  accent?: "neon" | "violet" | "rose";
}) {
  const dot =
    accent === "violet" ? "bg-violet-400" : accent === "rose" ? "bg-rose-400" : "bg-neon-400";
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
            <span className={cx("h-1.5 w-1.5 rounded-full", dot)} />
            {eyebrow}
          </div>
        ) : null}
        <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
      </div>
      {right}
    </header>
  );
}

const BADGE_TONES = {
  neon: "border-neon-400/30 bg-neon-400/10 text-neon-400",
  violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  rose: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  slate: "border-white/12 bg-white/5 text-white/60",
} as const;

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-medium uppercase tracking-wider",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  size = "md",
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "px-3 py-1.5 text-[11.5px]" : "px-4 py-2.5 text-[13px]",
        variant === "primary" &&
          "bg-neon-400 text-ink-950 hover:bg-neon-400/85 hover:shadow-[0_0_28px_-8px_rgba(62,232,200,0.7)]",
        variant === "outline" && "border border-white/15 text-white/80 hover:border-neon-400/50 hover:text-white",
        variant === "ghost" && "text-white/60 hover:bg-white/5 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div
        className={cx(
          "mt-1 font-mono text-lg font-bold",
          tone === "good" ? "text-neon-400" : tone === "warn" ? "text-amber-300" : "text-white",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[10.5px] text-white/35">{hint}</div> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
    >
      <span
        className={cx(
          "mt-0.5 flex h-4.5 w-8 shrink-0 items-center rounded-full border px-0.5 transition",
          checked ? "border-neon-400/60 bg-neon-400/25" : "border-white/15 bg-white/5",
        )}
      >
        <span
          className={cx(
            "h-3 w-3 rounded-full transition-transform",
            checked ? "translate-x-3.5 bg-neon-400" : "bg-white/40",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-white/85">{label}</span>
        {hint ? <span className="block text-[11px] leading-snug text-white/40">{hint}</span> : null}
      </span>
    </button>
  );
}

export function Meter({ value, tone = "neon" }: { value: number; tone?: "neon" | "violet" | "amber" }) {
  const color = tone === "violet" ? "bg-violet-400" : tone === "amber" ? "bg-amber-400" : "bg-neon-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div
        className={cx("h-full rounded-full transition-all duration-700", color)}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}
