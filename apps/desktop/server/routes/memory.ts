import type { FastifyInstance } from "fastify";
import type { AppStorage } from "@cubism/storage";

export function registerMemoryRoutes(server: FastifyInstance, storage: AppStorage): void {
  server.get("/memory/:conversationId", async (request) => {
    const { conversationId } = request.params as { conversationId: string };
    return { messages: storage.getConversationMessages(conversationId) };
  });
}
