import { describe, expect, it } from "vitest";
import { getStoredApiKey, setStoredApiKey, type EncryptionAdapter, type SettingStore } from "./apiKeyStorage.js";

class MemorySettings implements SettingStore {
  private readonly settings = new Map<string, string>();

  getSetting(key: string): string | null {
    return this.settings.get(key) ?? null;
  }

  setSetting(key: string, value: string): void {
    this.settings.set(key, value);
  }
}

function encryptionAdapter(available: boolean): EncryptionAdapter {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, "")
  };
}

describe("API key storage", () => {
  it("round-trips API keys only when encrypted storage is available", () => {
    const settings = new MemorySettings();
    const encryption = encryptionAdapter(true);

    setStoredApiKey(settings, encryption, "sk-test");

    expect(settings.getSetting("secure.openaiApiKey")).not.toBe("sk-test");
    expect(getStoredApiKey(settings, encryption)).toBe("sk-test");
  });

  it("rejects storing API keys when encrypted storage is unavailable", () => {
    const settings = new MemorySettings();

    expect(() => setStoredApiKey(settings, encryptionAdapter(false), "sk-test")).toThrow(/secure api key storage/i);
    expect(settings.getSetting("secure.openaiApiKey")).toBeNull();
  });

  it("does not return stored values when encrypted storage is unavailable", () => {
    const settings = new MemorySettings();
    const encryption = encryptionAdapter(true);
    setStoredApiKey(settings, encryption, "sk-test");

    expect(getStoredApiKey(settings, encryptionAdapter(false))).toBeNull();
  });
});
