import { app, BrowserWindow, ipcMain } from 'electron';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

// Disable GPU acceleration to avoid GPU process crashes on Windows
// Must be called before app.whenReady()
app.disableHardwareAcceleration();

// Resolve paths relative to the built dist-electron/main.js location
// In dev: __dirname points to src/electron, in prod: points to dist-electron
const getBackendPath = () => {
  // When built with esbuild --format=cjs, __dirname is the output directory
  // We need to go up to project root then into backend
  // From dist-electron -> project root -> backend
  const projectRoot = path.resolve(__dirname, '../..');
  return path.join(projectRoot, 'backend/ai_converter_cli/cli.py');
};

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // Don't show until ready
  });

  // In development, load from Vite dev server; in production, load built index.html
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // From dist-electron -> frontend/dist/index.html
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[ELECTRON] Loading:', indexPath);
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('[ELECTRON] Failed to load index.html:', err);
    });
  }

  mainWindow.once('ready-to-show', () => {
    console.log('[ELECTRON] Window ready to show');
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[ELECTRON] Failed to load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[ELECTRON] Page loaded successfully');
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handler: receives HTML content + options, runs Python CLI, returns markdown
ipcMain.handle('convert', async (_event, payload: { html: string; fileName: string; options: Record<string, unknown> }) => {
  const { html, fileName, options } = payload;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conv-'));
  const fileNameSafe = fileName || 'input.html';
  const htmlPath = path.join(tmpDir, fileNameSafe);

  await fs.writeFile(htmlPath, html, 'utf-8');

  // Build Python CLI arguments from TypeScript options
  const args: string[] = [
    '--indice', '1',
    '--force',
  ];

  const opts = options || {};

  if (opts.includeFrontMatter === false) {
    args.push('--sem-cabecalho');
  }
  if (opts.htmlOriginal === true) {
    args.push('--html-original');
  }

  const platform = (opts.platform as string) || 'auto';
  const platformLabels: Record<string, string> = {
    'google-ai': 'Google Modo IA / Search',
    chatgpt: 'ChatGPT',
    generic: 'Generic',
  };

  if (platformLabels[platform]) {
    args.push('--plataforma', platformLabels[platform]);
  }

  if (opts.title) {
    args.push('--titulo', opts.title as string);
  }

  args.push(tmpDir);

  return new Promise((resolve, reject) => {
    const pythonScript = getBackendPath();
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    // Run as module to avoid relative import issues
    const moduleArgs = ['-m', 'ai_converter_cli.cli', ...args];
    // Set encoding for Windows console compatibility
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };

    execFile(pythonCmd, moduleArgs, { timeout: 30000, cwd: path.resolve(__dirname, '../../backend'), env }, async (error, stdout, stderr) => {
      // The Python CLI writes to tmpDir with .md extension
      const outputName = fileNameSafe.replace(/\.html$/i, '.md');
      const mdPath = path.join(tmpDir, outputName);

      if (error) {
        // Cleanup temp dir on error
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        return reject({ code: 'PYTHON_ERROR', message: stderr || error.message });
      }

      // Read the markdown file BEFORE cleaning up temp dir
      try {
        const markdown = await fs.readFile(mdPath, 'utf-8');
        // Cleanup temp dir after successful read
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        resolve({
          markdown,
          fileName: fileNameSafe,
          outputName,
        });
      } catch (readErr) {
        // Cleanup temp dir on read error
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        reject({ code: 'READ_ERROR', message: readErr.message, stdout });
      }
    });
  });
});
