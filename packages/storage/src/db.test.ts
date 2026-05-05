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
        "live2d_assets",
        "schema_migrations",
        "live2d_models",
        "live2d_motion_mappings",
        "live2d_expression_mappings",
        "character_runtime_settings"
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
    storage.upsertLive2DModel({
      id: "model_1",
      entryPath: "/models/test.model3.json",
      baseDir: "/models",
      displayName: "Test Model",
      modelHash: "hash_1",
      manifestJson: "{}",
      validationReportJson: "{\"ok\":true}"
    });
    storage.upsertMotionMapping({ id: "motion_1", modelId: "model_1", semantic: "speaking", groupName: "TapBody", motionIndex: 0, priority: "normal" });
    storage.upsertExpressionMapping({ id: "expr_1", modelId: "model_1", emotion: "joy", expressionName: "happy" });
    storage.upsertCharacterRuntimeSettings({
      characterId: "char_1",
      modelId: "model_1",
      scale: 0.9,
      offsetX: 0,
      offsetY: 0,
      idlePolicyJson: "{}",
      lipSyncPolicyJson: "{}",
      gazePolicyJson: "{}"
    });
    expect(storage.listLive2DModels()).toEqual([expect.objectContaining({ id: "model_1", displayName: "Test Model" })]);
    expect(storage.getMotionMappings("model_1")).toEqual([expect.objectContaining({ semantic: "speaking", groupName: "TapBody" })]);
    expect(storage.getExpressionMappings("model_1")).toEqual([expect.objectContaining({ emotion: "joy", expressionName: "happy" })]);
    expect(storage.getCharacterRuntimeSettings("char_1")).toEqual(expect.objectContaining({ modelId: "model_1", scale: 0.9 }));
    expect(tables).not.toContain("audio_recordings");
    storage.close();
  });
});
