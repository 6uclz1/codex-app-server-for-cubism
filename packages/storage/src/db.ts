import { DatabaseSync } from "node:sqlite";
import type { CharacterProfile, ConversationRecord, MessageRecord } from "@cubism/shared-types";

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
      CREATE TABLE IF NOT EXISTS character_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model_path TEXT NOT NULL,
        persona_prompt TEXT NOT NULL,
        default_voice TEXT,
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
        `INSERT INTO character_profiles (id, name, model_path, persona_prompt, default_voice, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           model_path = excluded.model_path,
           persona_prompt = excluded.persona_prompt,
           default_voice = excluded.default_voice,
           updated_at = excluded.updated_at`
      )
      .run(profile.id, profile.name, profile.modelPath, profile.personaPrompt, profile.defaultVoice ?? null, profile.createdAt ?? timestamp, profile.updatedAt ?? timestamp);
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

  close(): void {
    this.db.close();
  }
}

export function createStorage(path: string): AppStorage {
  return new AppStorage(path);
}
