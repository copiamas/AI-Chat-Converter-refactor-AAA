/**
 * Deterministic fixtures used by the self-test suite and by the "carregar
 * exemplo" buttons. They mimic the two shapes the tool must support:
 * a Google AI Mode page (no authorship metadata) and a ChatGPT export
 * (explicit `data-message-author-role`).
 */

export const GOOGLE_AI_FIXTURE = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Google AI Mode</title>
  <style>.aim-chip{display:none}body{font-family:sans-serif}</style>
  <script>window.__BOOTSTRAP = {"tracking": true};</script>
</head>
<body>
  <header><nav><a>In\u00edcio</a><a>Hist\u00f3rico</a><button>Nova conversa</button></nav></header>
  <main>
    <div class="query-content"><p>explique isso: como funciona o garbage collector do Python e quando ele falha?</p></div>
    <div class="model-response-text">
      <p>Aqui est\u00e1 o compilado do que importa sobre o garbage collector do Python.</p>
      <h3>Reference counting</h3>
      <p>O CPython conta refer\u00eancias por objeto e libera mem\u00f3ria quando o contador chega a zero.</p>
      <ul><li>Determin\u00edstico na maioria dos casos</li><li>Falha com refer\u00eancias circulares</li></ul>
      <pre><code class="language-python">import gc
gc.collect()  # quebra ciclos</code></pre>
      <h3>Ciclos e o m\u00f3dulo gc</h3>
      <p>O coletor geracional entra em a\u00e7\u00e3o apenas para ciclos, e \u00e9 desligado em tempo real quando <code>gc.disable()</code> \u00e9 chamado.</p>
      <blockquote>Regra pr\u00e1tica: me\u00e7a antes de otimizar.</blockquote>
      <table><tr><th>Cen\u00e1rio</th><th>Risco</th></tr><tr><td>Ciclos com __del__</td><td>Vazamento</td></tr></table>
    </div>
    <div class="feedback-buttons"><button>Boa resposta</button><button>Resposta ruim</button></div>
    <div class="sharing-links"><button>Copiar</button><button>Compartilhar link p\u00fablico</button><span>Uma c\u00f3pia desta conversa ser\u00e1 inclu\u00edda.</span></div>
    <p class="disclaimer">A IA pode cometer erros. Por isso, cheque as respostas</p>
    <div class="query-content"><p>agora essa aqui: mostre um exemplo real de vazamento em asyncio.</p></div>
    <div class="model-response-text">
      <p>Para esse cen\u00e1rio de tasks esquecidas, o vazamento cl\u00e1ssico acontece quando uma coroutine guarda refer\u00eancia de si mesma atrav\u00e9s de um callback pendente.</p>
      <pre><code class="language-python">tasks = set()
def spawn(coro):
    task = asyncio.create_task(coro)
    tasks.add(task)
    task.add_done_callback(tasks.discard)</code></pre>
      <p>Perceba o <strong>done_callback</strong> removendo a task do conjunto: sem ele, o conjunto cresce para sempre.</p>
    </div>
    <p>O Google pode usar os dados e o conte\u00fado enviado para melhorar os servi\u00e7os. <a href="#">solicita\u00e7\u00e3o de remo\u00e7\u00e3o judicial</a></p>
  </main>
  <footer><span>Privacidade</span><span>Termos</span></footer>
</body>
</html>`;

export const CHATGPT_FIXTURE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Refactor plan</title><style>.btn{padding:4px}</style></head>
<body>
  <div class="conversation">
    <article data-message-author-role="user">
      <p>I need to refactor a CLI that parses saved chat pages. What should I split first?</p>
    </article>
    <article data-message-author-role="assistant">
      <p>Here is the order I would follow, with the reason for each step.</p>
      <ol><li>Isolate IO from parsing</li><li>Extract a pure segmentation function</li><li>Add golden-file tests</li></ol>
      <pre><code class="language-bash">pytest tests/ -q --cov=aicli</code></pre>
      <p>Step 3 is the one that makes the refactor <strong>safe</strong> to merge.</p>
    </article>
    <article data-message-author-role="user">
      <p>Can you show the test for the segmentation function?</p>
    </article>
    <article data-message-author-role="assistant">
      <p>Certainly \u2014 a golden file comparison is enough:</p>
      <pre><code class="language-python">def test_segments_two_turns():
    result = convert(FIXTURES / "google.html")
    assert result.turns == 2</code></pre>
    </article>
  </div>
  <div class="action-buttons"><button>Copy</button><button>Edit</button><button>Regenerate</button></div>
  <p>ChatGPT can make mistakes. Check important info.</p>
</body>
</html>`;

export const BROKEN_FIXTURE = `<html><head><meta charset="utf-8"><title>broken</title></head>
<body><p>explique isso: algo</p><div><p>Aqui est\u00e1 <b>negrito</b></div></body></html>`;

export const EMPTY_FIXTURE = `<html><head><title>login</title></head><body><form><input name="email"></form></body></html>`;

export interface Fixture {
  id: string;
  label: string;
  fileName: string;
  html: string;
  hint: string;
}

export const FIXTURES: readonly Fixture[] = [
  {
    id: "google",
    label: "Google AI Mode",
    fileName: "modo-ia-python-gc.html",
    html: GOOGLE_AI_FIXTURE,
    hint: "Sem metadados de autoria \u2192 heur\u00edstica l\u00e9xica + filtro de chrome em pt-BR.",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    fileName: "refactor-plan.html",
    html: CHATGPT_FIXTURE,
    hint: "Com data-message-author-role \u2192 pap\u00e9is declarados, confian\u00e7a m\u00e1xima.",
  },
  {
    id: "broken",
    label: "HTML quebrado",
    fileName: "export quebrado.HTML",
    html: BROKEN_FIXTURE,
    hint: "Markup inv\u00e1lido + nome com espa\u00e7o e extens\u00e3o mai\u00fascula.",
  },
  {
    id: "empty",
    label: "P\u00e1gina sem conversa",
    fileName: "login.html",
    html: EMPTY_FIXTURE,
    hint: "Deve falhar com erro tipado NO_CONTENT, nunca com traceback.",
  },
];
