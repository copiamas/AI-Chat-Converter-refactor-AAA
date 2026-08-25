import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cx(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PY_KEYWORDS =
  "def|class|return|yield|if|elif|else|for|while|in|not|and|or|is|import|from|as|with|try|except|finally|raise|None|True|False|async|await|lambda|assert|pass|break|continue|global|del|self|match|case";

const PATTERNS: Record<string, RegExp> = {
  python: new RegExp(
    [
      "(#[^\\n]*)",
      "(\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?''')",
      "(f?\"(?:[^\"\\\\\\n]|\\\\.)*\"|f?'(?:[^'\\\\\\n]|\\\\.)*')",
      "(`[^`\\n]*`)",
      "(@[A-Za-z_][\\w.]*)",
      `\\b(${PY_KEYWORDS})\\b`,
      "\\b(\\d[\\d_]*(?:\\.\\d+)?)\\b",
    ].join("|"),
    "g",
  ),
  toml: /((?:^|\n)\s*\[[^\]\n]+\])|(#[^\n]*)|("(?:[^"\\]|\\.)*")|^([A-Za-z0-9_.-]+)(?=\s*=)|\b(\d+(?:\.\d+)?)\b/gm,
  markdown: /(^#{1,6} [^\n]*)|(```[\s\S]*?```|`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(^\|[^\n]*)/gm,
  yaml: /(^#[^\n]*)|("(?:[^"\\]|\\.)*")|(^[\w.-]+)(?=:)|\b(\d+(?:\.\d+)?)\b/gm,
};

const CLASSES = ["tok-com", "tok-com", "tok-str", "tok-str", "tok-dec", "tok-key", "tok-num"];

/** Minimal, dependency-free highlighter. Content is first-party only. */
export function highlight(code: string, lang: string): string {
  const escaped = escapeHtml(code);
  const pattern = PATTERNS[lang] ?? PATTERNS.yaml;
  return escaped.replace(pattern, (match, ...groups) => {
    for (let i = 0; i < CLASSES.length; i += 1) {
      if (groups[i] !== undefined) {
        return `<span class="${CLASSES[i]}">${match}</span>`;
      }
    }
    return match;
  });
}

export function CodeBlock({
  code,
  lang = "python",
  className,
  showLines = true,
}: {
  code: string;
  lang?: string;
  className?: string;
  showLines?: boolean;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div className={cx("relative overflow-auto rounded-xl border border-white/10 bg-[#04060c]", className)}>
      <pre className="min-w-full p-4 text-[12.5px] leading-[1.65]">
        <code className="font-mono">
          {lines.map((line, index) => (
            <span key={index} className="grid grid-cols-[3.2rem_1fr] gap-3">
              {showLines ? (
                <span className="select-none text-right text-white/20">{index + 1}</span>
              ) : null}
              <span
                className="whitespace-pre text-white/80"
                dangerouslySetInnerHTML={{ __html: highlight(line, lang) || "&nbsp;" }}
              />
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
