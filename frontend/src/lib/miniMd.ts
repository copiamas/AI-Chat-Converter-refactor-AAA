/**
 * Tiny, dependency-free Markdown renderer for the live preview.
 * Supports the exact subset the converter emits: front-matter, headings,
 * fences, blockquotes, ordered/unordered lists, tables, hr and inline styles.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(raw: string): string {
  const codes: string[] = [];
  let text = escapeHtml(raw).replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  text = text
    .replace(/\*\*([^*]+)\*\*/g, "<strong class='text-white'>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del class='opacity-60'>$1</del>")
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_m, label: string, href: string) =>
        `<a class="text-neon-400 underline decoration-dotted" href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`,
    )
    .replace(/(^|[\s])(https?:\/\/[^\s<)]+)/g, "$1<span class='text-sky-300/80'>$2</span>");

  return text.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => `<code class="rounded bg-white/10 px-1 py-0.5">${codes[Number(index)]}</code>`);
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  // Front matter block
  if (lines[0]?.trim() === "---") {
    const rows: string[] = [];
    i = 1;
    while (i < lines.length && lines[i].trim() !== "---") {
      const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
      if (match) rows.push(`<div class="flex gap-3"><span class="w-28 shrink-0 text-white/40">${match[1]}</span><span class="text-neon-400/90">${inline(match[2])}</span></div>`);
      i += 1;
    }
    i += 1;
    html.push(
      `<div class="mb-6 rounded-xl border border-neon-400/25 bg-neon-400/5 p-4 font-mono text-[12px] leading-relaxed"><div class="mb-2 text-[10px] uppercase tracking-[0.2em] text-neon-400/70">front-matter</div>${rows.join("")}</div>`,
    );
  }

  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      html.push(`<p class="mb-3 text-[13.5px] leading-relaxed text-white/75">${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      flush();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(
        `<pre class="mb-4 overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-4 text-[12px] leading-relaxed text-neon-400/90"><code>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const size = level === 1 ? "text-xl" : level === 2 ? "text-base" : "text-sm";
      html.push(
        `<h${level} class="mt-5 mb-2 ${size} font-bold tracking-tight text-white">${inline(heading[2])}</h${level}>`,
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(
        `<blockquote class="mb-4 border-l-2 border-violet-400/60 bg-violet-400/5 px-4 py-2 text-[13px] text-violet-100/80">${inline(body.join(" "))}</blockquote>`,
      );
      continue;
    }

    if (/^\s*\|/.test(line)) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i]));
        i += 1;
      }
      const [head, ...body] = rows;
      html.push(
        `<div class="mb-4 overflow-x-auto"><table class="w-full border-collapse text-[12.5px]"><thead><tr>${head
          .map((cell) => `<th class="border-b border-white/15 px-3 py-2 text-left font-semibold text-white">${inline(cell)}</th>`)
          .join("")}</tr></thead><tbody>${body
          .map(
            (row) =>
              `<tr>${row
                .map((cell) => `<td class="border-b border-white/5 px-3 py-2 text-white/70">${inline(cell)}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(
        `<${tag} class="mb-4 space-y-1 pl-5 text-[13.5px] text-white/75 ${ordered ? "list-decimal" : "list-disc"} marker:text-neon-400/70">${items
          .map((item) => `<li>${inline(item)}</li>`)
          .join("")}</${tag}>`,
      );
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flush();
      html.push(`<hr class="my-5 border-white/10" />`);
      i += 1;
      continue;
    }

    if (/^_\S.*_$/.test(line.trim())) {
      flush();
      html.push(`<p class="mb-3 text-[11.5px] italic text-white/45">${inline(line.trim().replace(/^_|_$/g, ""))}</p>`);
      i += 1;
      continue;
    }

    if (!line.trim()) {
      flush();
      i += 1;
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }

  flush();
  return html.join("\n");
}
