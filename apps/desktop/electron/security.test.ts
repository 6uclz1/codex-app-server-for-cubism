import { describe, expect, it } from "vitest";
import {
  createContentSecurityPolicy,
  isAllowedAppResourceFileUrl,
  isAllowedLive2DAssetFileUrl,
  secureWebPreferences,
  shouldBlockRestrictedFileRequest
} from "./security.js";

describe("Electron security", () => {
  it("uses isolated preload IPC and a narrow CSP", () => {
    expect(secureWebPreferences("/tmp/preload.js")).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: "/tmp/preload.js"
    });

    const csp = createContentSecurityPolicy(49152);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: file: http://127.0.0.1:49152");
    expect(csp).toContain("media-src 'self' blob: http://127.0.0.1:49152");
    expect(csp).toContain("connect-src 'self' file: https://api.openai.com http://127.0.0.1:49152");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toContain("*");
  });

  it("allows only Live2D asset extensions for dynamic file requests", () => {
    expect(isAllowedLive2DAssetFileUrl("file:///Users/me/model/Avatar.model3.json")).toBe(true);
    expect(isAllowedLive2DAssetFileUrl("file:///Users/me/model/Avatar.moc3")).toBe(true);
    expect(isAllowedLive2DAssetFileUrl("file:///Users/me/model/Avatar.2048/texture_00.PNG")).toBe(true);
    expect(isAllowedLive2DAssetFileUrl("file:///Users/me/model/motions/idle.motion3.json")).toBe(true);
    expect(isAllowedLive2DAssetFileUrl("file:///Users/me/model/expressions/happy.exp3.json")).toBe(true);
    expect(isAllowedLive2DAssetFileUrl("file:///Users/me/model/physics.physics3.json")).toBe(true);

    expect(isAllowedLive2DAssetFileUrl("file:///Users/me/.ssh/id_rsa")).toBe(false);
    expect(isAllowedLive2DAssetFileUrl("file:///Users/me/model/notes.json")).toBe(false);
    expect(isAllowedLive2DAssetFileUrl("https://example.com/Avatar.model3.json")).toBe(false);
  });

  it("blocks non-Live2D file reads without breaking app bundle resources", () => {
    expect(shouldBlockRestrictedFileRequest("file:///Users/me/.ssh/id_rsa", "xhr")).toBe(true);
    expect(shouldBlockRestrictedFileRequest("file:///Users/me/model/notes.json", "image")).toBe(true);
    expect(shouldBlockRestrictedFileRequest("file:///Users/me/model/Avatar.model3.json", "xhr")).toBe(false);
    expect(shouldBlockRestrictedFileRequest("file:///Users/me/model/texture.webp", "image")).toBe(false);

    const appResourceRoots = ["/Applications/App/renderer"];
    expect(isAllowedAppResourceFileUrl("file:///Applications/App/renderer/assets/main.js", appResourceRoots)).toBe(true);
    expect(isAllowedAppResourceFileUrl("file:///Applications/App/renderer/assets/main.css", appResourceRoots)).toBe(true);
    expect(isAllowedAppResourceFileUrl("file:///Applications/App/other/main.js", appResourceRoots)).toBe(false);
    expect(shouldBlockRestrictedFileRequest("file:///Applications/App/renderer/assets/main.js", "other", { appResourceRoots })).toBe(false);
    expect(shouldBlockRestrictedFileRequest("file:///Applications/App/renderer/assets/main.css", "other", { appResourceRoots })).toBe(false);

    expect(shouldBlockRestrictedFileRequest("file:///Applications/App/renderer/index.html", "mainFrame", { appResourceRoots })).toBe(false);
    expect(shouldBlockRestrictedFileRequest("file:///Applications/App/renderer/assets/main.js", "script", { appResourceRoots })).toBe(false);
    expect(shouldBlockRestrictedFileRequest("https://api.openai.com/v1/responses", "xhr")).toBe(false);
  });
});
