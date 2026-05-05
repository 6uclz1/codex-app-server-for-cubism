export interface RawModel3Json {
  Version?: number;
  FileReferences?: {
    Moc?: string;
    Textures?: string[];
    Physics?: string;
    Pose?: string;
    UserData?: string;
    Motions?: Record<string, Array<{ File?: string; Sound?: string; FadeInTime?: number; FadeOutTime?: number }>>;
    Expressions?: Array<{ Name?: string; File?: string }>;
  };
  Groups?: Array<{ Target?: string; Name?: string; Ids?: string[] }>;
  HitAreas?: Array<{ Id?: string; Name?: string }>;
}

export interface ModelAssetRef {
  kind: "moc" | "texture" | "motion" | "expression" | "physics" | "pose" | "userdata" | "sound";
  file: string;
  name?: string;
  group?: string;
  index?: number;
}

export interface MotionManifestEntry {
  group: string;
  index: number;
  file: string;
  sound?: string;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export interface ExpressionManifestEntry {
  name: string;
  file: string;
}

export interface ModelGroup {
  target: string;
  name: string;
  ids: string[];
}

export interface ModelHitArea {
  id: string;
  name: string;
}

export interface ModelManifest {
  version: number | null;
  entryPath: string;
  baseDir: string;
  modelHash: string;
  moc: ModelAssetRef;
  textures: ModelAssetRef[];
  motions: MotionManifestEntry[];
  expressions: ExpressionManifestEntry[];
  physics?: ModelAssetRef;
  pose?: ModelAssetRef;
  userData?: ModelAssetRef;
  groups: ModelGroup[];
  hitAreas: ModelHitArea[];
  raw: RawModel3Json;
}

export interface AssetValidationItem {
  kind: ModelAssetRef["kind"];
  file: string;
  reason: "missing" | "path_traversal" | "absolute_path" | "bad_extension" | "too_large";
  message: string;
}

export interface AssetValidationReport {
  ok: boolean;
  checked: number;
  missing: AssetValidationItem[];
  unsupported: AssetValidationItem[];
  warnings: AssetValidationItem[];
  performanceHints: string[];
}

const expectedExtensions: Record<ModelAssetRef["kind"], readonly string[]> = {
  moc: [".moc3"],
  texture: [".png", ".jpg", ".jpeg", ".webp"],
  motion: [".motion3.json"],
  expression: [".exp3.json"],
  physics: [".physics3.json"],
  pose: [".pose3.json"],
  userdata: [".userdata3.json", ".cdi3.json"],
  sound: [".wav", ".mp3", ".ogg"]
};

export function parseModel3Manifest(entryPath: string, raw: RawModel3Json): ModelManifest {
  const references = raw.FileReferences ?? {};
  if (!references.Moc) {
    throw new Error("model3.json is missing FileReferences.Moc.");
  }
  const baseDir = dirname(entryPath);
  const textures = (references.Textures ?? []).map((file) => ({ kind: "texture" as const, file }));
  const motions = Object.entries(references.Motions ?? {}).flatMap(([group, entries]) =>
    entries.map((entry, index) => ({
      group,
      index,
      file: requiredFile(entry.File, `motion ${group}[${index}]`),
      sound: entry.Sound,
      fadeInMs: secondsToMs(entry.FadeInTime),
      fadeOutMs: secondsToMs(entry.FadeOutTime)
    }))
  );
  const expressions = (references.Expressions ?? []).map((entry, index) => ({
    name: entry.Name ?? `expression_${index}`,
    file: requiredFile(entry.File, `expression ${entry.Name ?? index}`)
  }));
  const manifestWithoutHash = {
    version: raw.Version ?? null,
    entryPath,
    baseDir,
    modelHash: "",
    moc: { kind: "moc" as const, file: references.Moc },
    textures,
    motions,
    expressions,
    physics: references.Physics ? { kind: "physics" as const, file: references.Physics } : undefined,
    pose: references.Pose ? { kind: "pose" as const, file: references.Pose } : undefined,
    userData: references.UserData ? { kind: "userdata" as const, file: references.UserData } : undefined,
    groups: (raw.Groups ?? []).map((group) => ({ target: group.Target ?? "", name: group.Name ?? "", ids: group.Ids ?? [] })).filter((group) => group.name),
    hitAreas: (raw.HitAreas ?? []).map((area) => ({ id: area.Id ?? "", name: area.Name ?? area.Id ?? "" })).filter((area) => area.id),
    raw
  };
  return {
    ...manifestWithoutHash,
    modelHash: hashModelManifest(entryPath, manifestWithoutHash)
  };
}

export async function parseModel3ManifestFile(entryPath: string): Promise<ModelManifest> {
  const { readFile } = await import("node:fs/promises");
  const raw = JSON.parse(await readFile(entryPath, "utf8")) as RawModel3Json;
  return parseModel3Manifest(entryPath, raw);
}

export async function validateModelAssets(manifest: ModelManifest, options: { maxAssetBytes?: number } = {}): Promise<AssetValidationReport> {
  const { access, stat } = await import("node:fs/promises");
  const maxAssetBytes = options.maxAssetBytes ?? 64 * 1024 * 1024;
  const missing: AssetValidationItem[] = [];
  const unsupported: AssetValidationItem[] = [];
  const warnings: AssetValidationItem[] = [];
  const performanceHints: string[] = [];
  const assets = listManifestAssets(manifest);

  for (const asset of assets) {
    const pathError = validateRelativeAssetPath(manifest.baseDir, asset.file);
    if (pathError) {
      unsupported.push({ kind: asset.kind, file: asset.file, reason: pathError, message: `Asset path is not allowed: ${asset.file}` });
      continue;
    }
    if (!hasExpectedExtension(asset.kind, asset.file)) {
      unsupported.push({ kind: asset.kind, file: asset.file, reason: "bad_extension", message: `Unexpected ${asset.kind} file extension: ${asset.file}` });
      continue;
    }
    const fullPath = join(manifest.baseDir, asset.file);
    try {
      await access(fullPath);
      const info = await stat(fullPath);
      if (info.size > maxAssetBytes) {
        warnings.push({ kind: asset.kind, file: asset.file, reason: "too_large", message: `Large Live2D asset may affect startup: ${asset.file}` });
      }
    } catch {
      missing.push({ kind: asset.kind, file: asset.file, reason: "missing", message: `Referenced Live2D asset is missing: ${asset.file}` });
    }
  }
  if (manifest.textures.length > 4) {
    performanceHints.push("Model references many textures; consider lowering resolution for desktop companion mode.");
  }
  return {
    ok: missing.length === 0 && unsupported.length === 0,
    checked: assets.length,
    missing,
    unsupported,
    warnings,
    performanceHints
  };
}

export function listManifestAssets(manifest: ModelManifest): ModelAssetRef[] {
  const assets: ModelAssetRef[] = [manifest.moc, ...manifest.textures];
  for (const motion of manifest.motions) {
    assets.push({ kind: "motion", file: motion.file, group: motion.group, index: motion.index });
    if (motion.sound) {
      assets.push({ kind: "sound", file: motion.sound, group: motion.group, index: motion.index });
    }
  }
  assets.push(...manifest.expressions.map((expression) => ({ kind: "expression" as const, file: expression.file, name: expression.name })));
  if (manifest.physics) assets.push(manifest.physics);
  if (manifest.pose) assets.push(manifest.pose);
  if (manifest.userData) assets.push(manifest.userData);
  return assets;
}

export function validateRelativeAssetPath(baseDir: string, file: string): "path_traversal" | "absolute_path" | null {
  if (isAbsolute(file)) {
    return "absolute_path";
  }
  const normalized = normalize(join(baseDir, file));
  const pathFromBase = relative(baseDir, normalized);
  if (pathFromBase === "" || pathFromBase.startsWith("..") || isAbsolute(pathFromBase)) {
    return "path_traversal";
  }
  return null;
}

export function hashModelManifest(entryPath: string, manifest: Omit<ModelManifest, "modelHash">): string {
  return stableHash(`${entryPath}:${JSON.stringify({ moc: manifest.moc, textures: manifest.textures, motions: manifest.motions, expressions: manifest.expressions, groups: manifest.groups })}`);
}

function requiredFile(file: string | undefined, label: string): string {
  if (!file) {
    throw new Error(`model3.json is missing file reference for ${label}.`);
  }
  return file;
}

function secondsToMs(value: number | undefined): number | undefined {
  return typeof value === "number" ? Math.round(value * 1000) : undefined;
}

function hasExpectedExtension(kind: ModelAssetRef["kind"], file: string): boolean {
  const lower = file.toLowerCase();
  return expectedExtensions[kind].some((suffix) => lower.endsWith(suffix)) || (kind === "userdata" && extname(lower) === ".json");
}

function dirname(path: string): string {
  const normalized = normalize(path);
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return normalized.startsWith("/") ? "/" : ".";
  }
  return normalized.slice(0, index);
}

function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join("/"));
}

function normalize(path: string): string {
  const absolute = path.startsWith("/");
  const segments: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!absolute) {
        segments.push(part);
      }
      continue;
    }
    segments.push(part);
  }
  return `${absolute ? "/" : ""}${segments.join("/")}` || (absolute ? "/" : ".");
}

function relative(from: string, to: string): string {
  const fromParts = normalize(from).split("/").filter(Boolean);
  const toParts = normalize(to).split("/").filter(Boolean);
  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }
  return [...Array(fromParts.length - shared).fill(".."), ...toParts.slice(shared)].join("/") || "";
}

function isAbsolute(path: string): boolean {
  return path.startsWith("/") || /^[a-z]:[\\/]/i.test(path);
}

function extname(path: string): string {
  const name = path.split("/").pop() ?? "";
  const index = name.indexOf(".");
  return index === -1 ? "" : name.slice(index);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
