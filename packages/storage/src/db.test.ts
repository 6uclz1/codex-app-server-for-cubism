import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createStorage } from "./db.js";

describe("storage", () => {
  it("migrates SQLite tables and persists conversations without audio data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cubism-storage-"));
    const storage = createStorage(join(dir, "app.sqlite"));
    storage.migrate();

    const tables = storage.listTables();
    expect(tables).toEqual(
      expect.arrayContaining([
        "character_profiles",
        "conversations",
        "messages",
        "app_settings",
        "live2d_assets"
      ])
    );

    storage.upsertCharacterProfile({
      id: "char_1",
      name: "Test Character",
      modelPath: "/models/test.model3.json",
      personaPrompt: "Helpful and concise",
      defaultVoice: "alloy"
    });
    storage.createConversation({ id: "conv_1", characterId: "char_1", title: "Hello" });
    storage.addMessage({ id: "msg_1", conversationId: "conv_1", role: "assistant", content: "Hi", emotion: "joy" });

    expect(storage.getConversationMessages("conv_1")).toEqual([
      expect.objectContaining({ content: "Hi", emotion: "joy" })
    ]);
    expect(tables).not.toContain("audio_recordings");
    storage.close();
  });
});
