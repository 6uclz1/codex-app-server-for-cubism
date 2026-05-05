import Fastify, { type FastifyInstance } from "fastify";
import { createStorage } from "@cubism/storage";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerModelRoutes } from "./routes/models.js";
import { registerRealtimeRoutes } from "./routes/realtime.js";
import { registerResponseRoutes } from "./routes/responses.js";
import { registerSettingsRoutes } from "./routes/settings.js";

export interface LocalServerOptions {
  storagePath: string;
  getApiKey: () => Promise<string | null>;
  authToken: string;
  modelSearchRoots?: string[];
  openAiBaseUrl?: string;
}

export function localListenOptions(port: number) {
  return { host: "127.0.0.1", port };
}

export async function buildLocalServer(options: LocalServerOptions): Promise<FastifyInstance> {
  if (!options.authToken.trim()) {
    throw new Error("Local API auth token must be configured.");
  }
  const storage = createStorage(options.storagePath);
  storage.migrate();
  const openAiBaseUrl = options.openAiBaseUrl ?? "https://api.openai.com/v1";
  const server = Fastify({ logger: false });

  server.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", request.headers.origin ?? "*");
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Headers", "content-type,x-cubism-local-token");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
    if (request.method === "GET" && request.url.startsWith("/live2d-assets/")) {
      return;
    }
    const header = request.headers["x-cubism-local-token"];
    const token = Array.isArray(header) ? header[0] : header;
    if (token !== options.authToken) {
      return reply.code(401).send({ error: "local_api_auth_required" });
    }
  });

  server.addHook("onClose", async () => {
    storage.close();
  });

  server.get("/health", async () => ({ ok: true, service: "codex-app-server-for-cubism" }));
  registerSettingsRoutes(server, storage);
  registerModelRoutes(server, storage, { modelSearchRoots: options.modelSearchRoots ?? [] });
  registerMemoryRoutes(server, storage);
  registerRealtimeRoutes(server, { getApiKey: options.getApiKey, openAiBaseUrl });
  registerResponseRoutes(server, { getApiKey: options.getApiKey, openAiBaseUrl });

  return server;
}
