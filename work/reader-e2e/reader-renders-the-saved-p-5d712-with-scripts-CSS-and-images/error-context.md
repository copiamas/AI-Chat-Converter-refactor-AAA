# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: reader.spec.ts >> renders the saved page inside the original tab with scripts, CSS and images
- Location: tests\e2e\reader.spec.ts:7:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 1
Received:    584.2000122070312
```

# Test source

```ts
  1   | import { test, expect, _electron as electron } from "@playwright/test";
  2   | import path from "node:path";
  3   | import { mkdtemp, readFile, unlink, rmdir } from "node:fs/promises";
  4   | import os from "node:os";
  5   | import { createServer } from "node:http";
  6   | 
  7   | test("renders the saved page inside the original tab with scripts, CSS and images", async () => {
  8   |   const app = await electron.launch({
  9   |     args: [path.resolve("dist-electron/main.cjs")],
  10  |     env: { ...process.env, READER_E2E: "1", READER_E2E_FIXTURE: "" },
  11  |   });
  12  |   try {
  13  |     const page = await app.firstWindow();
  14  |     async function choose(file: string) {
  15  |       await app.evaluate(({ dialog }, filePath) => {
  16  |         dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  17  |       }, file);
  18  |       await page.getByRole("button", { name: "Importar HTML", exact: true }).click();
  19  |     }
  20  |     const state = () => app.evaluate(async ({ BrowserWindow }) => {
  21  |       const host = BrowserWindow.getAllWindows()[0];
  22  |       const view = host.contentView.children.find(child => "webContents" in child) as Electron.WebContentsView | undefined;
  23  |       if (!view) return null;
  24  |       return { visible: view.getVisible(), bounds: view.getBounds(), windows: BrowserWindow.getAllWindows().length,
  25  |         page: await view.webContents.executeJavaScript("({title:document.title,visible:!!document.querySelector('#content')?.getBoundingClientRect().height,bg:getComputedStyle(document.body).backgroundColor,image:document.querySelector('#local-image')?.naturalWidth,bridge:typeof window.readerAPI,node:typeof require,text:document.body.innerText})") };
  26  |     });
  27  |     await choose(path.resolve("tests/fixtures/browser-page.html"));
  28  |     await expect(page.locator("aside h2")).toHaveText("Página com JavaScript");
  29  |     await page.getByRole("button", { name: "Página original", exact: true }).click();
  30  |     await expect.poll(async () => (await state())?.page.visible).toBe(true);
  31  |     const first = await state();
  32  |     expect(first?.windows).toBe(1);
  33  |     expect(first?.visible).toBe(true);
  34  |     expect(first?.bounds.width).toBeGreaterThan(400);
  35  |     expect(first?.bounds.x).toBeGreaterThan(200);
  36  |     const box = await page.locator(".nativePreview").boundingBox();
  37  |     expect(box).not.toBeNull();
  38  |     for (const key of ["x", "y", "width", "height"] as const) {
> 39  |       expect(Math.abs(first!.bounds[key] - box![key])).toBeLessThanOrEqual(1);
      |                                                        ^ Error: expect(received).toBeLessThanOrEqual(expected)
  40  |     }
  41  |     expect(first?.page.bg).toBe("rgb(24, 32, 48)");
  42  |     expect(first?.page.image).toBe(80);
  43  |     expect(first?.page.bridge).toBe("undefined");
  44  |     expect(first?.page.node).toBe("undefined");
  45  |     expect(first?.page.text).not.toContain("redirecionamento");
  46  |     const server = createServer((_request, response) => {
  47  |       response.setHeader("Access-Control-Allow-Origin", "*");
  48  |       response.end("NETWORK_CONTROL");
  49  |     });
  50  |     await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  51  |     try {
  52  |       const address = server.address() as { port: number };
  53  |       const url = `http://127.0.0.1:${address.port}/`;
  54  |       expect(await (await fetch(url)).text()).toBe("NETWORK_CONTROL");
  55  |       const blocked = await app.evaluate(async ({ BrowserWindow }, url) => {
  56  |         const view = BrowserWindow.getAllWindows()[0].contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
  57  |         return view.webContents.executeJavaScript(`fetch(${JSON.stringify(url)}).then(()=>false,()=>true)`);
  58  |       }, url);
  59  |       expect(blocked).toBe(true);
  60  |     } finally {
  61  |       await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  62  |     }
  63  |     const popup = await app.evaluate(async ({ BrowserWindow }) => {
  64  |       const view = BrowserWindow.getAllWindows()[0].contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
  65  |       return view.webContents.executeJavaScript("window.open('about:blank') === null");
  66  |     });
  67  |     expect(popup).toBe(true);
  68  |     await app.evaluate(async ({ BrowserWindow }) => {
  69  |       const view = BrowserWindow.getAllWindows()[0].contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
  70  |       const point = await view.webContents.executeJavaScript("(()=>{const r=document.querySelector('#action').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  71  |       view.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  72  |       view.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
  73  |     });
  74  |     await expect.poll(async () => (await state())?.page.text).toContain("Interação funcionando");
  75  |     await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 750));
  76  |     await expect.poll(async () => (await state())?.bounds.width).toBeLessThan(first!.bounds.width);
  77  |     await page.getByRole("button", { name: "Conteúdo extraído", exact: true }).click();
  78  |     await expect.poll(async () => (await state())?.visible ?? false).toBe(false);
  79  |     await choose(path.resolve("tests/fixtures/chat.html"));
  80  |     await expect(page.locator("aside h2")).toHaveText("Conversa de teste");
  81  |     await page.getByRole("textbox", { name: "Buscar no documento" }).fill("busca local");
  82  |     await expect(page.locator(".results button").first()).toContainText("busca local");
  83  |     const exportFolder = await mkdtemp(path.join(os.tmpdir(), "reader-export-"));
  84  |     const exportPath = path.join(exportFolder, "export.md");
  85  |     try {
  86  |       await app.evaluate(({ dialog }, filePath) => {
  87  |         dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  88  |       }, exportPath);
  89  |       await page.getByRole("button", { name: "Exportar Markdown", exact: true }).click();
  90  |       await expect(page.locator(".toast")).toContainText("Markdown salvo");
  91  |       expect(await readFile(exportPath, "utf8")).toContain("busca local");
  92  |     } finally {
  93  |       await unlink(exportPath).catch(() => {});
  94  |       await rmdir(exportFolder);
  95  |     }
  96  |     await page.getByRole("button", { name: "Página original", exact: true }).click();
  97  |     await expect.poll(async () => (await state())?.page.title).toBe("Conversa de teste");
  98  |     expect((await state())?.windows).toBe(1);
  99  |   } finally {
  100 |     await app.close();
  101 |   }
  102 | });
  103 | 
```