import { DatabaseSync } from "node:sqlite";
import type {
  CharacterProfile,
  CharacterRuntimeSettingsRecord,
  ConversationRecord,
  Live2DExpressionMappingRecord,
  Live2DModelRecord,
  Live2DMotionMappingRecord,
  MessageRecord
} from "@cubism/shared-types";

function nowIso(): string {
  return new Date().toISOString();
}

export class AppStorage {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    this.applyMigration(1, `
      CREATE TABLE IF NOT EXISTS character_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model_path TEXT NOT NULL,
        model_id TEXT,
        persona_prompt TEXT NOT NULL,
        default_voice TEXT,
        greeting TEXT,
        ng_topic_style TEXT,
        memory_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        title TEXT,
        openai_conversation_id TEXT,
        previous_response_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        emotion TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS live2d_assets (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL
      );
    `);
    this.applyMigration(2, `
      CREATE TABLE IF NOT EXISTS live2d_models (
        id TEXT PRIMARY KEY,
        entry_path TEXT NOT NULL,
        base_dir TEXT NOT NULL,
        display_name TEXT,
        model_hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        validation_report_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS live2d_motion_mappings (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        semantic TEXT NOT NULL,
        group_name TEXT NOT NULL,
        motion_index INTEGER,
        priority TEXT NOT NULL,
        UNIQUE(model_id, semantic)
      );

      CREATE TABLE IF NOT EXISTS live2d_expression_mappings (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        emotion TEXT NOT NULL,
        expression_name TEXT NOT NULL,
        UNIQUE(model_id, emotion)
      );

      CREATE TABLE IF NOT EXISTS character_runtime_settings (
        character_id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        scale REAL NOT NULL,
        offset_x REAL NOT NULL,
        offset_y REAL NOT NULL,
        idle_policy_json TEXT NOT NULL,
        lip_sync_policy_json TEXT NOT NULL,
        gaze_policy_json TEXT NOT NULL
      );
    `);
  }

  listTables(): string[] {
    return this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => String((row as { name: string }).name));
  }

  upsertCharacterProfile(profile: CharacterProfile): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO character_profiles (id, name, model_path, model_id, persona_prompt, default_voice, greeting, ng_topic_style, memory_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           model_path = excluded.model_path,
           model_id = excluded.model_id,
           persona_prompt = excluded.persona_prompt,
           default_voice = excluded.default_voice,
           greeting = excluded.greeting,
           ng_topic_style = excluded.ng_topic_style,
           memory_enabled = excluded.memory_enabled,
           updated_at = excluded.updated_at`
      )
      .run(
        profile.id,
        profile.name,
        profile.modelPath,
        profile.modelId ?? null,
        profile.personaPrompt,
        profile.defaultVoice ?? null,
        profile.greeting ?? null,
        profile.ngTopicStyle ?? null,
        profile.memoryEnabled === false ? 0 : 1,
        profile.createdAt ?? timestamp,
        profile.updatedAt ?? timestamp
      );
  }

  createConversation(conversation: ConversationRecord): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO conversations (id, character_id, title, openai_conversation_id, previous_response_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        conversation.id,
        conversation.characterId,
        conversation.title ?? null,
        conversation.openaiConversationId ?? null,
        conversation.previousResponseId ?? null,
        conversation.createdAt ?? timestamp,
        conversation.updatedAt ?? timestamp
      );
  }

  addMessage(message: MessageRecord): void {
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, emotion, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(message.id, message.conversationId, message.role, message.content, message.emotion ?? null, message.createdAt ?? nowIso());
  }

  getConversationMessages(conversationId: string): MessageRecord[] {
    return this.db
      .prepare("SELECT id, conversation_id, role, content, emotion, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(conversationId)
      .map((row) => {
        const record = row as {
          id: string;
          conversation_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          emotion: MessageRecord["emotion"];
          created_at: string;
        };
        return {
          id: record.id,
          conversationId: record.conversation_id,
          role: record.role,
          content: record.content,
          emotion: record.emotion,
          createdAt: record.created_at
        };
      });
  }

  setSetting(key: string, value: string): void {
    this.db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  upsertLive2DModel(model: Live2DModelRecord): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO live2d_models (id, entry_path, base_dir, display_name, model_hash, manifest_json, validation_report_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           entry_path = excluded.entry_path,
           base_dir = excluded.base_dir,
           display_name = excluded.display_name,
           model_hash = excluded.model_hash,
           manifest_json = excluded.manifest_json,
           validation_report_json = excluded.validation_report_json,
           updated_at = excluded.updated_at`
      )
      .run(
        model.id,
        model.entryPath,
        model.baseDir,
        model.displayName ?? null,
        model.modelHash,
        model.manifestJson,
        model.validationReportJson,
        model.createdAt ?? timestamp,
        model.updatedAt ?? timestamp
      );
  }

  listLive2DModels(): Live2DModelRecord[] {
    return this.db
      .prepare("SELECT id, entry_path, base_dir, display_name, model_hash, manifest_json, validation_report_json, created_at, updated_at FROM live2d_models ORDER BY updated_at DESC")
      .all()
      .map(rowToLive2DModel);
  }

  getLive2DModel(id: string): Live2DModelRecord | null {
    const row = this.db
      .prepare("SELECT id, entry_path, base_dir, display_name, model_hash, manifest_json, validation_report_json, created_at, updated_at FROM live2d_models WHERE id = ?")
      .get(id);
    return row ? rowToLive2DModel(row) : null;
  }

  deleteLive2DModel(id: string): void {
    this.db.prepare("DELETE FROM live2d_expression_mappings WHERE model_id = ?").run(id);
    this.db.prepare("DELETE FROM live2d_motion_mappings WHERE model_id = ?").run(id);
    this.db.prepare("DELETE FROM live2d_models WHERE id = ?").run(id);
  }

  upsertMotionMapping(mapping: Live2DMotionMappingRecord): void {
    this.db
      .prepare(
        `INSERT INTO live2d_motion_mappings (id, model_id, semantic, group_name, motion_index, priority)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(model_id, semantic) DO UPDATE SET
           group_name = excluded.group_name,
           motion_index = excluded.motion_index,
           priority = excluded.priority`
      )
      .run(mapping.id, mapping.modelId, mapping.semantic, mapping.groupName, mapping.motionIndex ?? null, mapping.priority);
  }

  getMotionMappings(modelId: string): Live2DMotionMappingRecord[] {
    return this.db
      .prepare("SELECT id, model_id, semantic, group_name, motion_index, priority FROM live2d_motion_mappings WHERE model_id = ? ORDER BY semantic ASC")
      .all(modelId)
      .map((row) => {
        const record = row as {
          id: string;
          model_id: string;
          semantic: string;
          group_name: string;
          motion_index: number | null;
          priority: "idle" | "normal" | "force";
        };
        return { id: record.id, modelId: record.model_id, semantic: record.semantic, groupName: record.group_name, motionIndex: record.motion_index, priority: record.priority };
      });
  }

  upsertExpressionMapping(mapping: Live2DExpressionMappingRecord): void {
    this.db
      .prepare(
        `INSERT INTO live2d_expression_mappings (id, model_id, emotion, expression_name)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(model_id, emotion) DO UPDATE SET expression_name = excluded.expression_name`
      )
      .run(mapping.id, mapping.modelId, mapping.emotion, mapping.expressionName);
  }

  getExpressionMappings(modelId: string): Live2DExpressionMappingRecord[] {
    return this.db
      .prepare("SELECT id, model_id, emotion, expression_name FROM live2d_expression_mappings WHERE model_id = ? ORDER BY emotion ASC")
      .all(modelId)
      .map((row) => {
        const record = row as { id: string; model_id: string; emotion: string; expression_name: string };
        return { id: record.id, modelId: record.model_id, emotion: record.emotion, expressionName: record.expression_name };
      });
  }

  upsertCharacterRuntimeSettings(settings: CharacterRuntimeSettingsRecord): void {
    this.db
      .prepare(
        `INSERT INTO character_runtime_settings (character_id, model_id, scale, offset_x, offset_y, idle_policy_json, lip_sync_policy_json, gaze_policy_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(character_id) DO UPDATE SET
           model_id = excluded.model_id,
           scale = excluded.scale,
           offset_x = excluded.offset_x,
           offset_y = excluded.offset_y,
           idle_policy_json = excluded.idle_policy_json,
           lip_sync_policy_json = excluded.lip_sync_policy_json,
           gaze_policy_json = excluded.gaze_policy_json`
      )
      .run(
        settings.characterId,
        settings.modelId,
        settings.scale,
        settings.offsetX,
        settings.offsetY,
        settings.idlePolicyJson,
        settings.lipSyncPolicyJson,
        settings.gazePolicyJson
      );
  }

  getCharacterRuntimeSettings(characterId: string): CharacterRuntimeSettingsRecord | null {
    const row = this.db
      .prepare("SELECT character_id, model_id, scale, offset_x, offset_y, idle_policy_json, lip_sync_policy_json, gaze_policy_json FROM character_runtime_settings WHERE character_id = ?")
      .get(characterId);
    if (!row) {
      return null;
    }
    const record = row as {
      character_id: string;
      model_id: string;
      scale: number;
      offset_x: number;
      offset_y: number;
      idle_policy_json: string;
      lip_sync_policy_json: string;
      gaze_policy_json: string;
    };
    return {
      characterId: record.character_id,
      modelId: record.model_id,
      scale: record.scale,
      offsetX: record.offset_x,
      offsetY: record.offset_y,
      idlePolicyJson: record.idle_policy_json,
      lipSyncPolicyJson: record.lip_sync_policy_json,
      gazePolicyJson: record.gaze_policy_json
    };
  }

  close(): void {
    this.db.close();
  }

  private applyMigration(version: number, sql: string): void {
    const row = this.db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(version);
    if (row) {
      return;
    }
    this.db.exec("BEGIN;");
    try {
      this.db.exec(sql);
      this.db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, nowIso());
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }
}

function rowToLive2DModel(row: unknown): Live2DModelRecord {
  const record = row as {
    id: string;
    entry_path: string;
    base_dir: string;
    display_name: string | null;
    model_hash: string;
    manifest_json: string;
    validation_report_json: string;
    created_at: string;
    updated_at: string;
  };
  return {
    id: record.id,
    entryPath: record.entry_path,
    baseDir: record.base_dir,
    displayName: record.display_name,
    modelHash: record.model_hash,
    manifestJson: record.manifest_json,
    validationReportJson: record.validation_report_json,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export function createStorage(path: string): AppStorage {
  return new AppStorage(path);
}
