import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildCharacterDirectiveV2 } from "@cubism/conversation-core";
import type { OpenAiRouteOptions } from "./realtime.js";

const responseSchema = z.object({
  model: z.string().default("gpt-4.1-mini"),
  input: z.string(),
  instructions: z.string().optional(),
  previous_response_id: z.string().optional()
});

export function registerResponseRoutes(server: FastifyInstance, options: OpenAiRouteOptions): void {
  server.post("/responses", async (request, reply) => {
    const apiKey = await options.getApiKey();
    if (!apiKey) {
      return reply.code(401).send({ error: "openai_api_key_required" });
    }
    const payload = responseSchema.parse(request.body);
    const response = await fetch(`${options.openAiBaseUrl}/responses`, {
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
      directive: buildCharacterDirectiveV2(text)
    };
  });
}
