import { contextBridge, ipcRenderer } from "electron";

const api = {
  getLocalApiPort: (): Promise<number> => ipcRenderer.invoke("local-api:get-port"),
  getLocalApiConfig: (): Promise<{ port: number; authToken: string }> => ipcRenderer.invoke("local-api:get-config"),
  setApiKey: (apiKey: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("api-key:set", apiKey),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke("api-key:has"),
  selectModel3Json: (): Promise<string | null> => ipcRenderer.invoke("dialog:select-model3"),
  importLive2DModel: (entryPath: string, displayName?: string): Promise<{ ok: boolean; model?: unknown; manifest?: unknown; capabilities?: unknown; validation?: unknown; error?: string }> =>
    ipcRenderer.invoke("live2d:import-model", { entryPath, displayName }),
  listLive2DModels: (): Promise<{ ok: boolean; models?: unknown[]; error?: string }> => ipcRenderer.invoke("live2d:list-models"),
  deleteLive2DModel: (id: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("live2d:delete-model", id),
  saveLive2DMotionMappings: (modelId: string, mappings: unknown[]): Promise<{ ok: boolean; mappings?: unknown[]; error?: string }> =>
    ipcRenderer.invoke("live2d:save-motion-mappings", { modelId, mappings }),
  saveLive2DExpressionMappings: (modelId: string, mappings: unknown[]): Promise<{ ok: boolean; mappings?: unknown[]; error?: string }> =>
    ipcRenderer.invoke("live2d:save-expression-mappings", { modelId, mappings }),
  setCompanionWindowMode: (enabled: boolean): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("window:companion-mode", enabled),
  startCodex: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("codex:start"),
  loginCodex: (): Promise<{ ok: boolean; loginId?: string; error?: string }> => ipcRenderer.invoke("codex:login"),
  logoutCodex: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("codex:logout"),
  getCodexAccount: (): Promise<{ ok: boolean; account?: { type: string; email?: string; planType?: string } | null; requiresOpenaiAuth?: boolean; error?: string }> =>
    ipcRenderer.invoke("codex:account"),
  sendCodexChatMessage: (message: string): Promise<{ ok: boolean; text?: string; threadId?: string; turnId?: string; error?: string }> =>
    ipcRenderer.invoke("codex:chat", message),
  submitCodexTask: (prompt: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("codex:submit-task", prompt),
  onCodexEvent: (handler: (event: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload);
    ipcRenderer.on("codex:event", listener);
    return () => ipcRenderer.off("codex:event", listener);
  }
};

contextBridge.exposeInMainWorld("cubism", api);

export type CubismDesktopApi = typeof api;
