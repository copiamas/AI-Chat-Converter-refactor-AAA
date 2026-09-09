import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell, WebContentsView } from "electron";
import type { IpcMainInvokeEvent, Rectangle, Session } from "electron";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";

app.disableHardwareAcceleration();
const scheme = "reader-preview";
protocol.registerSchemesAsPrivileged([{ scheme, privileges: { secure: true, standard: true, supportFetchAPI: true } }]);
type Entry = { sourcePath: string; root: string; reasons: string[]; allowedFiles: Set<string>; allowedRoots: string[] };
const documents = new Map<string, Entry>();
let mainWindow: BrowserWindow | null = null;
let previewView: WebContentsView | null = null;
let previewDocument = "";
let previewGeneration = 0;
let activePreviewDocument = "";
let pendingPreviewBounds: Rectangle | null = null;
const backendRoot = path.resolve(__dirname, "../../backend");

function assertMain(event: IpcMainInvokeEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error("IPC_UNAUTHORIZED");
}
async function canonical(value: string) { return fs.realpath(path.resolve(value)); }
function contained(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function pathKey(value: string) { return process.platform === "win32" ? value.toLocaleLowerCase() : value; }
function localPath(reference: string, base: string, root: string) {
  const raw = reference.trim().replace(/^['"]|['"]$/g, "").split(/[?#]/, 1)[0];
  if (!raw || raw.startsWith("#") || /^(?:data|blob|file|https?|javascript|vbscript):/i.test(raw) || raw.startsWith("//") || path.isAbsolute(raw)) return null;
  const candidate = path.resolve(base, decodeURIComponent(raw));
  return contained(root, candidate) ? candidate : null;
}
async function resourceAccess(html: string, sourcePath: string, root: string) {
  const allowedFiles = new Set<string>([pathKey(sourcePath)]);
  const allowedRoots: string[] = [];
  for (const suffix of ["_files", ".files"]) {
    const folder = path.join(root, path.parse(sourcePath).name + suffix);
    try { const resolved = await canonical(folder); if (contained(root, resolved) && (await fs.stat(resolved)).isDirectory()) allowedRoots.push(resolved); } catch { /* optional browser asset folder */ }
  }
  const pending: string[] = [];
  const add = async (reference: string, base: string) => {
    try {
      const candidate = localPath(reference, base, root);
      if (!candidate) return;
      const resolved = await canonical(candidate);
      if (!contained(root, resolved) || !(await fs.stat(resolved)).isFile()) return;
      const key = pathKey(resolved);
      if (allowedFiles.has(key)) return;
      allowedFiles.add(key);
      if (/\.css$/i.test(resolved)) pending.push(resolved);
    } catch { /* missing resources remain unavailable */ }
  };
  const attributes = /\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(attributes)) await add(match[2], root);
  const srcsets = /\bsrcset\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(srcsets)) for (const item of match[2].split(",")) await add(item.trim().split(/\s+/, 1)[0], root);
  while (pending.length) {
    const cssPath = pending.pop()!;
    const css = await fs.readFile(cssPath, "utf8");
    const cssRefs = /url\(\s*([^)]*?)\s*\)|@import\s+(?:url\(\s*)?(["']?)([^\s;)'"}]+)\2/gi;
    for (const match of css.matchAll(cssRefs)) await add(match[1] || match[3], path.dirname(cssPath));
  }
  return { allowedFiles, allowedRoots };
}
function validId(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{20}$/i.test(value); }
function entryFor(value: unknown) {
  if (!validId(value)) throw new Error("INVALID_ID|Documento inválido.");
  const entry = documents.get(value);
  if (!entry) throw new Error("EXPIRED_DOCUMENT|Importe novamente.");
  return entry;
}
function python(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "python" : "python3", ["-m", "ai_converter_cli.reader_cli", ...args], {
      cwd: backendRoot, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { out += chunk; }); child.stderr.on("data", chunk => { err += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error("TIMEOUT|A operação excedeu 30 segundos.")); }, 30_000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(out.trim());
        data.ok ? resolve(data.document) : reject(new Error(`${data.error?.code ?? "READER_ERROR"}|${data.error?.message ?? "Falha ao ler o arquivo."}`));
      } catch { reject(new Error(`PYTHON_PROTOCOL|${err || "Resposta inválida."}`)); }
    });
  });
}
function analyze(html: string) {
  html = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, "");
  const reasons: string[] = [];
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh|location\s*\.(?:href|replace|assign)/i.test(html)) reasons.push("Redirecionamentos foram bloqueados.");
  if (/\b(?:src|href|poster)\s*=\s*["']\s*(?:https?:)?\/\//i.test(html)) reasons.push("Dependências de rede foram bloqueadas.");
  if (/<(?:iframe|frame|object|embed)\b/i.test(html)) reasons.push("Conteúdo incorporado externo pode não aparecer.");
  return reasons;
}
async function importPath(filePath: string) {
  const resolved = await canonical(filePath);
  const document = await python(["read", resolved]);
  const html = await fs.readFile(resolved, "utf8");
  const root = await canonical(path.dirname(resolved));
  const access = await resourceAccess(html, resolved, root);
  documents.set(document.id, { sourcePath: resolved, root, reasons: analyze(html), ...access });
  hidePreview();
  return { ...document, preview: { limited: analyze(html).length > 0, reasons: analyze(html) } };
}
function hidePreview() {
  previewGeneration += 1;
  activePreviewDocument = "";
  if (previewView) previewView.setVisible(false);
}
function destroyPreview() {
  previewGeneration += 1;
  if (!previewView) return;
  mainWindow?.contentView.removeChildView(previewView);
  previewView.webContents.close();
  previewView = null;
  previewDocument = "";
  activePreviewDocument = "";
}
let previewSessionConfigured = false;
async function configurePreviewSession(previewSession: Session) {
  if (previewSessionConfigured) return;
  previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  previewSession.setPermissionCheckHandler(() => false);
  previewSession.on("will-download", event => event.preventDefault());
  previewSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_details, callback) => callback({ cancel: true }));
  previewSession.webRequest.onBeforeRequest({ urls: ["file://*/*"] }, (_details, callback) => callback({ cancel: true }));
  if (!(await previewSession.protocol.isProtocolHandled(scheme))) await previewSession.protocol.handle(scheme, handlePreviewRequest);
  previewSessionConfigured = true;
}
async function handlePreviewRequest(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.protocol !== `${scheme}:` || url.hostname !== activePreviewDocument) return new Response("Forbidden", { status: 403 });
    const entry = entryFor(url.hostname);
    const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const unresolved = path.resolve(entry.root, relative);
    if (!contained(entry.root, unresolved)) return new Response("Forbidden", { status: 403 });
    const target = await canonical(unresolved);
    if (!contained(entry.root, target)) return new Response("Forbidden", { status: 403 });
    const permitted = entry.allowedFiles.has(pathKey(target)) || entry.allowedRoots.some(root => contained(root, target));
    if (!permitted) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  } catch { return new Response("Not found", { status: 404 }); }
}
async function showPreview(id: string) {
  const entry = entryFor(id);
  const generation = ++previewGeneration;
  activePreviewDocument = id;
  if (!mainWindow) throw new Error("WINDOW_CLOSED|A janela principal foi fechada.");
  if (!previewView) {
    const previewSession = session.fromPartition("reader-preview-isolated");
    await configurePreviewSession(previewSession);
    if (generation !== previewGeneration || !mainWindow || mainWindow.isDestroyed()) return { limited: entry.reasons.length > 0, reasons: entry.reasons };
    if (!previewView) previewView = new WebContentsView({ webPreferences: {
      session: previewSession, javascript: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false,
    } });
    previewView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    previewView.webContents.on("will-navigate", event => event.preventDefault());
    previewView.webContents.on("will-redirect", event => event.preventDefault());
    previewView.webContents.on("before-input-event", (event, input) => {
      if ((input.control || input.meta) && ["R", "L", "O", "S"].includes(input.key.toUpperCase())) event.preventDefault();
    });
    previewView.setVisible(false);
    if (pendingPreviewBounds) previewView.setBounds(pendingPreviewBounds);
    mainWindow.contentView.addChildView(previewView);
  }
  if (previewDocument !== id) {
    try { await previewView.webContents.loadURL(`${scheme}://${id}/${encodeURIComponent(path.basename(entry.sourcePath))}`); }
    catch (error) { if (generation !== previewGeneration) return { limited: entry.reasons.length > 0, reasons: entry.reasons }; throw error; }
    if (generation !== previewGeneration) return { limited: entry.reasons.length > 0, reasons: entry.reasons };
    previewDocument = id;
  }
  if (generation !== previewGeneration) return { limited: entry.reasons.length > 0, reasons: entry.reasons };
  previewView.setVisible(true);
  return { limited: entry.reasons.length > 0, reasons: entry.reasons };
}
function setPreviewBounds(value: unknown) {
  if (!mainWindow || typeof value !== "object" || value === null) return;
  const raw = value as Record<string, unknown>;
  const numbers = ["x", "y", "width", "height"].map(key => Number(raw[key]));
  if (!numbers.every(Number.isFinite)) throw new Error("INVALID_BOUNDS|Área de visualização inválida.");
  const [x, y, width, height] = numbers.map(Math.round);
  const content = mainWindow.getContentBounds();
  const bounds: Rectangle = {
    x: Math.max(0, Math.min(x, content.width - 1)),
    y: Math.max(0, Math.min(y, content.height - 1)),
    width: Math.max(1, Math.min(width, content.width - Math.max(0, x))),
    height: Math.max(1, Math.min(height, content.height - Math.max(0, y))),
  };
  pendingPreviewBounds = bounds;
  previewView?.setBounds(bounds);
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 880, minHeight: 620, show: process.env.READER_E2E !== "1",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", event => event.preventDefault());
  mainWindow.on("close", destroyPreview);
  mainWindow.on("closed", () => { mainWindow = null; });
  void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  mainWindow.once("ready-to-show", () => { if (process.env.READER_E2E !== "1") mainWindow?.show(); });
}

app.whenReady().then(() => {
  createWindow();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.handle("reader:choose", async event => {
  assertMain(event);
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ["openFile"], filters: [{ name: "Páginas HTML", extensions: ["html", "htm"] }] });
  return result.canceled ? null : importPath(result.filePaths[0]);
});
ipcMain.handle("reader:import", async (event, filePath: unknown) => {
  assertMain(event); if (typeof filePath !== "string" || !filePath) throw new Error("INVALID_PATH|Caminho inválido."); return importPath(filePath);
});
ipcMain.handle("reader:preview-show", async (event, id: unknown) => { assertMain(event); if (!validId(id)) throw new Error("INVALID_ID|Documento inválido."); return showPreview(id); });
ipcMain.handle("reader:preview-hide", event => { assertMain(event); hidePreview(); });
ipcMain.handle("reader:preview-bounds", (event, bounds: unknown) => { assertMain(event); setPreviewBounds(bounds); });
ipcMain.handle("reader:export", async (event, id: unknown) => {
  assertMain(event); const entry = entryFor(id);
  const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: path.join(entry.root, path.parse(entry.sourcePath).name + ".md"), filters: [{ name: "Markdown", extensions: ["md"] }] });
  if (result.canceled || !result.filePath) return null;
  return python(["export", entry.sourcePath, result.filePath]).then(document => document.exported_path);
});
ipcMain.handle("reader:open-external", async (event, id: unknown) => {
  assertMain(event); const entry = entryFor(id); const error = await shell.openPath(entry.sourcePath);
  if (error) throw new Error("OPEN_ERROR|" + error); return true;
});
