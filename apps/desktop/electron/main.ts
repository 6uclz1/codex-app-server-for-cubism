import { existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from "electron";
import type { FastifyInstance } from "fastify";
import { CodexAppServerClient } from "@cubism/codex-client";
import { detectCapabilities, parseModel3ManifestFile, validateModelAssets } from "@cubism/live2d-domain";
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
let companionMode = false;

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

  localServer = await buildLocalServer({ storagePath, getApiKey, authToken: localApiAuthToken, modelSearchRoots: [userData] });
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
  windowRef.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${sourceId}:${line} ${message}`);
  });
  windowRef.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer:gone] ${details.reason}`);
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [createContentSecurityPolicy(localApiPort, { allowUnsafeInlineScripts: Boolean(process.env.ELECTRON_RENDERER_URL) })]
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
ipcMain.handle("live2d:import-model", async (_event, payload: { entryPath: string; displayName?: string }) => {
  try {
    if (!payload.entryPath?.endsWith(".model3.json")) {
      return { ok: false, error: "Selected file must be a .model3.json file." };
    }
    if (!storage) {
      return { ok: false, error: "Storage is not initialized." };
    }
    const manifest = await parseModel3ManifestFile(payload.entryPath);
    const validation = await validateModelAssets(manifest);
    const capabilities = detectCapabilities(manifest);
    const model = {
      id: stableId(payload.entryPath, manifest.modelHash),
      entryPath: payload.entryPath,
      baseDir: manifest.baseDir,
      displayName: payload.displayName ?? basename(payload.entryPath, ".model3.json"),
      modelHash: manifest.modelHash,
      manifestJson: JSON.stringify(manifest),
      validationReportJson: JSON.stringify(validation)
    };
    storage.upsertLive2DModel(model);
    seedDefaultMappings(storage, model.id, manifest);
    return { ok: true, model, manifest, capabilities, validation };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("live2d:list-models", () => {
  try {
    return { ok: true, models: storage?.listLive2DModels() ?? [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("live2d:delete-model", (_event, id: string) => {
  try {
    storage?.deleteLive2DModel(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("live2d:save-motion-mappings", (_event, payload: { modelId: string; mappings: Array<{ id?: string; semantic: string; groupName: string; motionIndex?: number | null; priority?: "idle" | "normal" | "force" }> }) => {
  try {
    for (const mapping of payload.mappings) {
      storage?.upsertMotionMapping({
        id: mapping.id ?? stableId(payload.modelId, mapping.semantic),
        modelId: payload.modelId,
        semantic: mapping.semantic,
        groupName: mapping.groupName,
        motionIndex: mapping.motionIndex ?? null,
        priority: mapping.priority ?? "normal"
      });
    }
    return { ok: true, mappings: storage?.getMotionMappings(payload.modelId) ?? [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("live2d:save-expression-mappings", (_event, payload: { modelId: string; mappings: Array<{ id?: string; emotion: string; expressionName: string }> }) => {
  try {
    for (const mapping of payload.mappings) {
      storage?.upsertExpressionMapping({
        id: mapping.id ?? stableId(payload.modelId, mapping.emotion),
        modelId: payload.modelId,
        emotion: mapping.emotion,
        expressionName: mapping.expressionName
      });
    }
    return { ok: true, mappings: storage?.getExpressionMappings(payload.modelId) ?? [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("window:companion-mode", (_event, enabled: boolean) => {
  try {
    companionMode = enabled;
    if (windowRef) {
      windowRef.setAlwaysOnTop(enabled, "floating");
      windowRef.setSkipTaskbar(enabled);
      windowRef.setBackgroundColor(enabled ? "#00000000" : "#eef1f3");
      windowRef.setResizable(!enabled);
      if (enabled) {
        windowRef.setSize(420, 620);
      } else {
        windowRef.setSize(1220, 820);
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
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

function stableId(...parts: string[]): string {
  return `live2d_${createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 16)}`;
}

function seedDefaultMappings(storageInstance: AppStorage, modelId: string, manifest: { motions: Array<{ group: string; index: number }>; expressions: Array<{ name: string }> }): void {
  const idle = manifest.motions.find((motion) => motion.group.toLowerCase() === "idle") ?? manifest.motions[0];
  const tap = manifest.motions.find((motion) => /tap|body/i.test(motion.group)) ?? idle;
  if (idle) {
    storageInstance.upsertMotionMapping({ id: stableId(modelId, "idle"), modelId, semantic: "idle", groupName: idle.group, motionIndex: idle.index, priority: "idle" });
  }
  if (tap) {
    for (const semantic of ["speaking", "tapBody", "happy", "thinking", "success", "error"]) {
      storageInstance.upsertMotionMapping({ id: stableId(modelId, semantic), modelId, semantic, groupName: tap.group, motionIndex: tap.index, priority: "normal" });
    }
  }
  for (const emotion of ["joy", "fun", "anger", "sorrow", "surprised", "thinking", "neutral"]) {
    const expression = manifest.expressions.find((entry) => entry.name.toLowerCase().includes(emotion)) ?? manifest.expressions[0];
    if (expression) {
      storageInstance.upsertExpressionMapping({ id: stableId(modelId, emotion), modelId, emotion, expressionName: expression.name });
    }
  }
}
