import type { BrowserWindowConstructorOptions } from "electron";
import { isAbsolute, normalize, relative } from "node:path";

const LIVE2D_ASSET_FILE_SUFFIXES = [
  ".model3.json",
  ".moc3",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".motion3.json",
  ".exp3.json",
  ".physics3.json",
  ".pose3.json",
  ".cdi3.json",
  ".userdata3.json"
] as const;

const RESTRICTED_FILE_REQUEST_TYPES = new Set(["xhr", "image", "media", "object", "font", "subFrame", "other"]);

export interface RestrictedFileRequestOptions {
  appResourceRoots?: string[];
}

export function secureWebPreferences(preload: string): NonNullable<BrowserWindowConstructorOptions["webPreferences"]> {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  };
}

export function createContentSecurityPolicy(localApiPort: number): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: file:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' file: https://api.openai.com http://127.0.0.1:${localApiPort}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'"
  ].join("; ");
}

export function isAllowedLive2DAssetFileUrl(url: string): boolean {
  const path = fileUrlToPathname(url);
  if (!path) {
    return false;
  }
  return LIVE2D_ASSET_FILE_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix));
}

export function isAllowedAppResourceFileUrl(url: string, appResourceRoots: string[]): boolean {
  const path = fileUrlToPathname(url);
  if (!path) {
    return false;
  }
  const normalizedPath = normalize(path);
  return appResourceRoots.some((root) => {
    const normalizedRoot = normalize(root);
    const pathFromRoot = relative(normalizedRoot, normalizedPath);
    return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
  });
}

export function shouldBlockRestrictedFileRequest(url: string, resourceType: string, options: RestrictedFileRequestOptions = {}): boolean {
  if (!url.startsWith("file:")) {
    return false;
  }
  if (isAllowedAppResourceFileUrl(url, options.appResourceRoots ?? [])) {
    return false;
  }
  if (!RESTRICTED_FILE_REQUEST_TYPES.has(resourceType)) {
    return false;
  }
  return !isAllowedLive2DAssetFileUrl(url);
}

function fileUrlToPathname(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "file:") {
    return null;
  }
  return decodeURIComponent(parsed.pathname);
}
