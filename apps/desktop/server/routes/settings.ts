import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppStorage } from "@cubism/storage";

const settingSchema = z.object({ value: z.string() });

export function registerSettingsRoutes(server: FastifyInstance, storage: AppStorage): void {
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
}
