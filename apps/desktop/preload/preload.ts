import { contextBridge, ipcRenderer } from "electron";

const api = {
  getLocalApiPort: (): Promise<number> => ipcRenderer.invoke("local-api:get-port"),
  getLocalApiConfig: (): Promise<{ port: number; authToken: string }> => ipcRenderer.invoke("local-api:get-config"),
  setApiKey: (apiKey: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("api-key:set", apiKey),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke("api-key:has"),
  selectModel3Json: (): Promise<string | null> => ipcRenderer.invoke("dialog:select-model3"),
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
