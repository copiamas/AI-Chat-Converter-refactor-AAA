import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtemp, readFile, unlink, rmdir } from "node:fs/promises";
import os from "node:os";
import { createServer } from "node:http";

test("renders the saved page inside the original tab with scripts, CSS and images", async () => {
  const app = await electron.launch({
    args: [path.resolve("dist-electron/main.cjs")],
    env: { ...process.env, READER_E2E: "1", READER_E2E_FIXTURE: "" },
  });
  try {
    const page = await app.firstWindow();
    async function choose(file: string) {
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, file);
      await page.getByRole("button", { name: "Importar HTML", exact: true }).click();
    }
    const state = () => app.evaluate(async ({ BrowserWindow }) => {
      const host = BrowserWindow.getAllWindows()[0];
      const view = host.contentView.children.find(child => "webContents" in child) as Electron.WebContentsView | undefined;
      if (!view) return null;
      return { visible: view.getVisible(), bounds: view.getBounds(), windows: BrowserWindow.getAllWindows().length,
        page: await view.webContents.executeJavaScript("({title:document.title,visible:!!document.querySelector('#content')?.getBoundingClientRect().height,bg:getComputedStyle(document.body).backgroundColor,image:document.querySelector('#local-image')?.naturalWidth,bridge:typeof window.readerAPI,node:typeof require,text:document.body.innerText})") };
    });
    await choose(path.resolve("tests/fixtures/browser-page.html"));
    await expect(page.locator("aside h2")).toHaveText("Página com JavaScript");
    await page.getByRole("button", { name: "Página original", exact: true }).click();
    await expect.poll(async () => (await state())?.page.visible).toBe(true);
    const first = await state();
    expect(first?.windows).toBe(1);
    expect(first?.visible).toBe(true);
    expect(first?.bounds.width).toBeGreaterThan(400);
    expect(first?.bounds.x).toBeGreaterThan(200);
    const box = await page.locator(".nativePreview").boundingBox();
    expect(box).not.toBeNull();
    for (const key of ["x", "y", "width", "height"] as const) {
      await expect.poll(async () => Math.abs((await state())!.bounds[key] - box![key]), { message: `preview ${key} matches the panel` }).toBeLessThanOrEqual(1);
    }
    expect(first?.page.bg).toBe("rgb(24, 32, 48)");
    expect(first?.page.image).toBe(80);
    expect(first?.page.bridge).toBe("undefined");
    expect(first?.page.node).toBe("undefined");
    expect(first?.page.text).not.toContain("redirecionamento");
    expect(await readFile(path.resolve("tests/fixtures/unreferenced-control.txt"), "utf8")).toContain("UNREFERENCED_CONTROL");
    const unrelatedStatus = await app.evaluate(async ({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
      return view.webContents.executeJavaScript("fetch('./unreferenced-control.txt').then(r=>r.status).catch(()=>403)");
    });
    expect(unrelatedStatus).toBe(403);
    const server = createServer((_request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.end("NETWORK_CONTROL");
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as { port: number };
      const url = `http://127.0.0.1:${address.port}/`;
      expect(await (await fetch(url)).text()).toBe("NETWORK_CONTROL");
      const blocked = await app.evaluate(async ({ BrowserWindow }, url) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
        return view.webContents.executeJavaScript(`fetch(${JSON.stringify(url)}).then(()=>false,()=>true)`);
      }, url);
      expect(blocked).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    const popup = await app.evaluate(async ({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
      return view.webContents.executeJavaScript("window.open('about:blank') === null");
    });
    expect(popup).toBe(true);
    await app.evaluate(async ({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
      const point = await view.webContents.executeJavaScript("(()=>{const r=document.querySelector('#action').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
      view.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
      view.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
    });
    await expect.poll(async () => (await state())?.page.text).toContain("Interação funcionando");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 750));
    await expect.poll(async () => (await state())?.bounds.width).not.toBe(first!.bounds.width);
    const resized = await state();
    expect(resized?.bounds.width).toBeGreaterThan(400);
    await page.getByRole("button", { name: "Conteúdo extraído", exact: true }).click();
    await expect.poll(async () => (await state())?.visible ?? false).toBe(false);
    await choose(path.resolve("tests/fixtures/chat.html"));
    await expect(page.locator("aside h2")).toHaveText("Conversa de teste");
    await page.getByRole("textbox", { name: "Buscar no documento" }).fill("busca local");
    await expect(page.locator(".results button").first()).toContainText("busca local");
    const exportFolder = await mkdtemp(path.join(os.tmpdir(), "reader-export-"));
    const exportPath = path.join(exportFolder, "export.md");
    try {
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, exportPath);
      await page.getByRole("button", { name: "Exportar Markdown", exact: true }).click();
      await expect(page.locator(".toast")).toContainText("Markdown salvo");
      expect(await readFile(exportPath, "utf8")).toContain("busca local");
    } finally {
      await unlink(exportPath).catch(() => {});
      await rmdir(exportFolder);
    }
    await page.getByRole("button", { name: "Página original", exact: true }).click();
    await expect.poll(async () => (await state())?.page.title).toBe("Conversa de teste");
    expect((await state())?.windows).toBe(1);
  } finally {
    await app.close();
  }
});
