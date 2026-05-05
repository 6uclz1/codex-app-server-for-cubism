import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildLocalServer, localListenOptions } from "./index.js";

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
