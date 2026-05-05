export const API_KEY_SETTING = "secure.openaiApiKey";

export interface SettingStore {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
}

export interface EncryptionAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export function getStoredApiKey(settings: SettingStore | null, encryption: EncryptionAdapter): string | null {
  const encrypted = settings?.getSetting(API_KEY_SETTING);
  if (!encrypted || !encryption.isEncryptionAvailable()) {
    return null;
  }
  return encryption.decryptString(Buffer.from(encrypted, "base64"));
}

export function setStoredApiKey(settings: SettingStore | null, encryption: EncryptionAdapter, apiKey: string): void {
  if (!settings) {
    throw new Error("Storage is not initialized.");
  }
  if (!encryption.isEncryptionAvailable()) {
    throw new Error("Secure API key storage is unavailable on this system.");
  }
  settings.setSetting(API_KEY_SETTING, encryption.encryptString(apiKey).toString("base64"));
}
