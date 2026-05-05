import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { buildCharacterDirective } from "@cubism/conversation-core";
import { createStorage } from "@cubism/storage";

export interface LocalServerOptions {
  storagePath: string;
  getApiKey: () => Promise<string | null>;
  authToken: string;
  modelSearchRoots?: string[];
  openAiBaseUrl?: string;
}

const settingSchema = z.object({ value: z.string() });
const sessionSchema = z.object({
  model: z.string().default("gpt-realtime"),
  voice: z.string().optional(),
  instructions: z.string().optional(),
  sdp: z.string().optional()
});
const responseSchema = z.object({
  model: z.string().default("gpt-4.1-mini"),
  input: z.string(),
  instructions: z.string().optional(),
  previous_response_id: z.string().optional()
});

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

  server.get("/settings/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const value = storage.getSetting(key);
    if (value === null) {
      return reply.code(404).send({ error: "setting_not_found" });
    }
    return { key, value };
  });

  server.put("/settings/:key", async (request) => {
    const { key } = request.params as { key: string };
    const payload = settingSchema.parse(request.body);
    storage.setSetting(key, payload.value);
    return { ok: true, key };
  });

  server.get("/models", async (request, reply) => {
    const root = ((request.query as { root?: string }).root ?? "").trim();
    if (!root) {
      return { models: [] };
    }
    if (!(await isAllowedModelRoot(root, options.modelSearchRoots ?? []))) {
      return reply.code(403).send({ error: "model_root_not_allowed" });
    }
    const models = await findModel3Files(root);
    return { models };
  });

  server.get("/memory/:conversationId", async (request) => {
    const { conversationId } = request.params as { conversationId: string };
    return { messages: storage.getConversationMessages(conversationId) };
  });

  server.post("/session", async (request, reply) => {
    const apiKey = await options.getApiKey();
    if (!apiKey) {
      return reply.code(401).send({ error: "openai_api_key_required" });
    }
    const payload = sessionSchema.parse(request.body);
    if (!payload.sdp) {
      return { model: payload.model, voice: payload.voice ?? "alloy", instructions: payload.instructions ?? "" };
    }

    const response = await fetch(`${openAiBaseUrl}/realtime/calls?model=${encodeURIComponent(payload.model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/sdp",
        Accept: "application/sdp",
        "OpenAI-Beta": "realtime=v1"
      },
      body: payload.sdp
    });
    if (!response.ok) {
      return reply.code(response.status).send({ error: "realtime_session_failed", detail: await response.text() });
    }
    return reply.type("application/sdp").send(await response.text());
  });

  server.post("/responses", async (request, reply) => {
    const apiKey = await options.getApiKey();
    if (!apiKey) {
      return reply.code(401).send({ error: "openai_api_key_required" });
    }
    const payload = responseSchema.parse(request.body);
    const response = await fetch(`${openAiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return reply.code(response.status).send({ error: "response_failed", detail: await response.text() });
    }
    const json = (await response.json()) as { id?: string; output_text?: string };
    const text = json.output_text ?? "";
    return {
      responseId: json.id,
      text,
      directive: buildCharacterDirective(text)
    };
  });

  return server;
}

async function isAllowedModelRoot(root: string, allowedRoots: string[]): Promise<boolean> {
  if (allowedRoots.length === 0) {
    return false;
  }

  const requestedRoot = await realpath(root).catch(() => null);
  if (!requestedRoot) {
    return false;
  }

  for (const allowedRoot of allowedRoots) {
    const resolvedAllowedRoot = await realpath(allowedRoot).catch(() => null);
    if (!resolvedAllowedRoot) {
      continue;
    }
    const pathFromAllowedRoot = relative(resolvedAllowedRoot, requestedRoot);
    if (pathFromAllowedRoot === "" || (!pathFromAllowedRoot.startsWith("..") && !isAbsolute(pathFromAllowedRoot))) {
      return true;
    }
  }
  return false;
}

async function findModel3Files(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name.endsWith(".model3.json")) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}
