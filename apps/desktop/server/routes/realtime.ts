import type { FastifyInstance } from "fastify";
import { z } from "zod";

const sessionSchema = z.object({
  model: z.string().default("gpt-realtime"),
  voice: z.string().optional(),
  instructions: z.string().optional(),
  sdp: z.string().optional()
});

export interface OpenAiRouteOptions {
  getApiKey: () => Promise<string | null>;
  openAiBaseUrl: string;
}

export function registerRealtimeRoutes(server: FastifyInstance, options: OpenAiRouteOptions): void {
  server.post("/session", async (request, reply) => {
    const apiKey = await options.getApiKey();
    if (!apiKey) {
      return reply.code(401).send({ error: "openai_api_key_required" });
    }
    const payload = sessionSchema.parse(request.body);
    if (!payload.sdp) {
      return { model: payload.model, voice: payload.voice ?? "alloy", instructions: payload.instructions ?? "" };
    }

    const response = await fetch(`${options.openAiBaseUrl}/realtime/calls?model=${encodeURIComponent(payload.model)}`, {
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
}
