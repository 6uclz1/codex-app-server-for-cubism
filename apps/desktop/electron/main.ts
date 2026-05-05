import { existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from "electron";
import type { FastifyInstance } from "fastify";
import { CodexAppServerClient } from "@cubism/codex-client";
import { createStorage, type AppStorage } from "@cubism/storage";
import { buildLocalServer, localListenOptions } from "../server/index.js";
import { getStoredApiKey, setStoredApiKey } from "./apiKeyStorage.js";
import { createContentSecurityPolicy, secureWebPreferences, shouldBlockRestrictedFileRequest } from "./security.js";

let windowRef: BrowserWindow | null = null;
let localApiPort = 0;
let storage: AppStorage | null = null;
let codexClient: CodexAppServerClient | null = null;
let codexEventUnsubscribe: (() => void) | null = null;
let localServer: FastifyInstance | null = null;

const localApiAuthToken = randomBytes(32).toString("base64url");
const mainBundleDir = dirname(fileURLToPath(import.meta.url));
const electronDistDir = join(mainBundleDir, "..");
const appDistDir = join(electronDistDir, "..");

async function getApiKey(): Promise<string | null> {
  return getStoredApiKey(storage, safeStorage);
}

function setApiKey(apiKey: string): void {
  setStoredApiKey(storage, safeStorage, apiKey);
}

function ensureCodexClient(): CodexAppServerClient {
  codexClient ??= new CodexAppServerClient();
  codexClient.start({ cwd: process.cwd() });
  codexEventUnsubscribe ??= codexClient.onEvent((event) => windowRef?.webContents.send("codex:event", event));
  return codexClient;
}

async function createWindow(): Promise<void> {
  const userData = app.getPath("userData");
  mkdirSync(userData, { recursive: true });
  const storagePath = join(userData, "app.sqlite");
  storage = createStorage(storagePath);
  storage.migrate();

  localServer = await buildLocalServer({ storagePath, getApiKey, authToken: localApiAuthToken });
  const address = await localServer.listen(localListenOptions(0));
  localApiPort = Number(new URL(address).port);

  const preload = join(electronDistDir, "preload/preload.cjs");
  windowRef = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "Cubism Character Desktop",
    webPreferences: secureWebPreferences(preload)
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [createContentSecurityPolicy(localApiPort)]
      }
    });
  });
  const appResourceRoots = [join(appDistDir, "renderer"), join(app.getAppPath(), "renderer")];
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["file://*/*"] }, (details, callback) => {
    callback({ cancel: shouldBlockRestrictedFileRequest(details.url, details.resourceType, { appResourceRoots }) });
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await windowRef.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    const indexPath = join(appDistDir, "renderer/index.html");
    if (!existsSync(indexPath)) {
      await windowRef.loadURL(pathToFileURL(join(app.getAppPath(), "renderer/index.html")).toString());
    } else {
      await windowRef.loadFile(indexPath);
    }
  }

  windowRef.on("closed", () => {
    windowRef = null;
  });
}

ipcMain.handle("local-api:get-port", () => localApiPort);
ipcMain.handle("local-api:get-config", () => ({ port: localApiPort, authToken: localApiAuthToken }));
ipcMain.handle("api-key:set", (_event, apiKey: string) => {
  try {
    setApiKey(apiKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("api-key:has", async () => Boolean(await getApiKey()));
ipcMain.handle("dialog:select-model3", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Live2D model3.json",
    properties: ["openFile"],
    filters: [{ name: "Live2D model3.json", extensions: ["json"] }]
  });
  const [path] = result.filePaths;
  return path?.endsWith(".model3.json") ? path : null;
});
ipcMain.handle("codex:start", () => {
  try {
    ensureCodexClient();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("codex:account", async () => {
  try {
    const account = await ensureCodexClient().readAccount();
    return { ok: true, ...account };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("codex:login", async () => {
  try {
    const result = await ensureCodexClient().startChatGptLogin();
    if (result.type !== "chatgpt") {
      return { ok: false, error: `Unsupported Codex login response: ${result.type}` };
    }
    await shell.openExternal(result.authUrl);
    return { ok: true, loginId: result.loginId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("codex:logout", async () => {
  try {
    await ensureCodexClient().logout();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("codex:chat", async (_event, message: string) => {
  try {
    const response = await ensureCodexClient().sendChatMessage(message);
    return { ok: true, ...response };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("codex:submit-task", async (_event, prompt: string) => {
  try {
    await ensureCodexClient().sendChatMessage(`Developer task: ${prompt}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  void localServer?.close();
  storage?.close();
  codexEventUnsubscribe?.();
  codexEventUnsubscribe = null;
  codexClient?.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
