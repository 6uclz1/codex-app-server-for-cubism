import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildLocalServer, localListenOptions } from "./index.js";
import { isAllowedLive2DAssetPath } from "./routes/models.js";

describe("local server", () => {
  const authToken = "test-local-api-token";
  const authHeaders = { "x-cubism-local-token": authToken };

  it("binds to localhost and requires local API authentication", async () => {
    expect(localListenOptions(0).host).toBe("127.0.0.1");

    const dir = await mkdtemp(join(tmpdir(), "cubism-server-"));
    const server = await buildLocalServer({
      storagePath: join(dir, "app.sqlite"),
      getApiKey: async () => null,
      authToken
    });

    const health = await server.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(401);

    const authenticatedHealth = await server.inject({ method: "GET", url: "/health", headers: authHeaders });
    expect(authenticatedHealth.statusCode).toBe(200);
    expect(authenticatedHealth.headers["access-control-allow-origin"]).toBe("*");

    const preflight = await server.inject({ method: "OPTIONS", url: "/health", headers: { origin: "http://127.0.0.1:5173" } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");

    const unauthenticatedSettings = await server.inject({
      method: "PUT",
      url: "/settings/openai.model",
      payload: { value: "gpt-4.1-mini" }
    });
    expect(unauthenticatedSettings.statusCode).toBe(401);

    const settings = await server.inject({
      method: "PUT",
      url: "/settings/openai.model",
      headers: authHeaders,
      payload: { value: "gpt-4.1-mini" }
    });
    expect(settings.statusCode).toBe(200);

    const missingKey = await server.inject({ method: "POST", url: "/session", headers: authHeaders, payload: { model: "gpt-realtime" } });
    expect(missingKey.statusCode).toBe(401);
    await server.close();
  });

  it("limits model discovery to configured roots", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cubism-server-"));
    const allowedRoot = join(dir, "models");
    const blockedRoot = join(dir, "blocked");
    await mkdir(join(allowedRoot, "avatar"), { recursive: true });
    await mkdir(blockedRoot, { recursive: true });
    await writeFile(join(allowedRoot, "avatar", "Avatar.model3.json"), "{}");
    await writeFile(join(blockedRoot, "Secret.model3.json"), "{}");

    const server = await buildLocalServer({
      storagePath: join(dir, "app.sqlite"),
      getApiKey: async () => null,
      authToken,
      modelSearchRoots: [allowedRoot]
    });

    const denied = await server.inject({ method: "GET", url: `/models?root=${encodeURIComponent(blockedRoot)}`, headers: authHeaders });
    expect(denied.statusCode).toBe(403);

    const allowed = await server.inject({ method: "GET", url: `/models?root=${encodeURIComponent(allowedRoot)}`, headers: authHeaders });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({ models: [join(allowedRoot, "avatar", "Avatar.model3.json")] });

    await server.close();
  });

  it("imports model3 manifests with validation reports and rejects bad paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cubism-server-"));
    const allowedRoot = join(dir, "models");
    await mkdir(join(allowedRoot, "avatar", "textures"), { recursive: true });
    await writeFile(join(allowedRoot, "avatar", "Avatar.moc3"), "");
    await writeFile(join(allowedRoot, "avatar", "textures", "texture_00.png"), "");
    const modelPath = join(allowedRoot, "avatar", "Avatar.model3.json");
    await writeFile(
      modelPath,
      JSON.stringify({
        FileReferences: {
          Moc: "Avatar.moc3",
          Textures: ["textures/texture_00.png"],
          Motions: { Idle: [{ File: "missing.motion3.json" }] },
          Expressions: [{ Name: "happy", File: "missing.exp3.json" }]
        },
        Groups: [{ Target: "Parameter", Name: "LipSync", Ids: ["ParamMouthOpenY"] }]
      })
    );

    const server = await buildLocalServer({
      storagePath: join(dir, "app.sqlite"),
      getApiKey: async () => null,
      authToken,
      modelSearchRoots: [allowedRoot]
    });

    const badSuffix = await server.inject({ method: "POST", url: "/models/import", headers: authHeaders, payload: { entryPath: join(allowedRoot, "avatar", "notes.json") } });
    expect(badSuffix.statusCode).toBe(400);

    const imported = await server.inject({ method: "POST", url: "/models/import", headers: authHeaders, payload: { entryPath: modelPath, displayName: "Avatar" } });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toEqual(
      expect.objectContaining({
        ok: true,
        model: expect.objectContaining({ entryPath: modelPath, displayName: "Avatar" }),
        capabilities: expect.objectContaining({ lipSyncParameters: ["ParamMouthOpenY"] }),
        validation: expect.objectContaining({ ok: false, missing: expect.any(Array) })
      })
    );

    const library = await server.inject({ method: "GET", url: "/models/library", headers: authHeaders });
    expect(library.json()).toEqual({ models: [expect.objectContaining({ displayName: "Avatar" })] });
    const modelId = imported.json<{ model: { id: string } }>().model.id;
    const modelAsset = await server.inject({ method: "GET", url: `/live2d-assets/${modelId}/Avatar.model3.json` });
    expect(modelAsset.statusCode).toBe(200);
    expect(modelAsset.headers["access-control-allow-origin"]).toBe("*");
    expect(modelAsset.headers["content-type"]).toContain("application/json");
    const textureAsset = await server.inject({ method: "GET", url: `/live2d-assets/${modelId}/textures/texture_00.png` });
    expect(textureAsset.statusCode).toBe(200);
    expect(textureAsset.headers["content-type"]).toContain("image/png");
    const traversal = await server.inject({ method: "GET", url: `/live2d-assets/${modelId}/%2E%2E%2FAvatar.model3.json` });
    expect(traversal.statusCode).toBe(400);
    const badExtension = await server.inject({ method: "GET", url: `/live2d-assets/${modelId}/notes.txt` });
    expect(badExtension.statusCode).toBe(400);
    await server.close();
  });

  it("accepts only safe relative Live2D asset paths", () => {
    expect(isAllowedLive2DAssetPath("Avatar.model3.json")).toBe(true);
    expect(isAllowedLive2DAssetPath("textures/texture_00.png")).toBe(true);
    expect(isAllowedLive2DAssetPath("motions/idle.motion3.json")).toBe(true);
    expect(isAllowedLive2DAssetPath("../secret.model3.json")).toBe(false);
    expect(isAllowedLive2DAssetPath("/Users/me/Avatar.model3.json")).toBe(false);
    expect(isAllowedLive2DAssetPath("notes.json")).toBe(false);
  });

  it("rejects empty local API auth tokens at startup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cubism-server-"));
    await expect(
      buildLocalServer({
        storagePath: join(dir, "app.sqlite"),
        getApiKey: async () => null,
        authToken: ""
      })
    ).rejects.toThrow(/auth token/i);
  });
});
