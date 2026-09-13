import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";

test("OpenDesign mostra a página original no WebContentsView", async () => {
  const app = await electron.launch({
    args: [path.resolve("dist-electron/main.cjs")],
    env: { ...process.env, READER_E2E: "1" },
  });
  try {
    const page = await app.firstWindow();
    await page.locator("#fileInput").setInputFiles(path.resolve("tests/fixtures/chat.html"));
    await expect(page.locator("#documentTitle")).toHaveText("Conversa de teste");
    await page.locator("#originalTab").click();
    await expect.poll(async () => app.evaluate(async ({ BrowserWindow }) => {
      const host = BrowserWindow.getAllWindows()[0];
      const view = host.contentView.children.find(child => "webContents" in child) as Electron.WebContentsView | undefined;
      if (!view) return { visible: false, text: "NO_VIEW" };
      return { visible: view.getVisible(), text: await view.webContents.executeJavaScript("document.body.innerText") };
    })).toMatchObject({ visible: true });
    const state = await app.evaluate(async ({ BrowserWindow }) => {
      const host = BrowserWindow.getAllWindows()[0];
      const view = host.contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
      return { visible: view.getVisible(), text: await view.webContents.executeJavaScript("document.body.innerText") };
    });
    expect(state.text).toContain("Como funciona uma busca local?");
  } finally {
    await app.close();
  }
});
