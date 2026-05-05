import { createReadStream } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppStorage } from "@cubism/storage";
import { detectCapabilities, parseModel3ManifestFile, validateModelAssets } from "@cubism/live2d-domain";

const importModelSchema = z.object({
  entryPath: z.string().min(1),
  displayName: z.string().optional()
});

const mappingSchema = z.object({
  modelId: z.string().min(1),
  mappings: z.array(
    z.object({
      id: z.string().optional(),
      semantic: z.string().min(1),
      groupName: z.string().min(1),
      motionIndex: z.number().int().nullable().optional(),
      priority: z.enum(["idle", "normal", "force"]).default("normal")
    })
  )
});

const expressionMappingSchema = z.object({
  modelId: z.string().min(1),
  mappings: z.array(
    z.object({
      id: z.string().optional(),
      emotion: z.string().min(1),
      expressionName: z.string().min(1)
    })
  )
});

const LIVE2D_ASSET_SUFFIXES = [
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
  ".userdata3.json",
  ".wav",
  ".mp3",
  ".ogg"
] as const;

export interface ModelRouteOptions {
  modelSearchRoots: string[];
}

export function registerModelRoutes(server: FastifyInstance, storage: AppStorage, options: ModelRouteOptions): void {
  server.get("/models", async (request, reply) => {
    const root = ((request.query as { root?: string }).root ?? "").trim();
    if (!root) {
      return { models: [] };
    }
    if (!(await isAllowedModelRoot(root, options.modelSearchRoots))) {
      return reply.code(403).send({ error: "model_root_not_allowed" });
    }
    const models = await findModel3Files(root);
    return { models };
  });

  server.get("/models/library", async () => ({ models: storage.listLive2DModels() }));

  server.get("/live2d-assets/:modelId/*", async (request, reply) => {
    const params = request.params as { modelId: string; "*": string };
    const model = storage.getLive2DModel(params.modelId);
    if (!model) {
      return reply.code(404).send({ error: "model_not_found" });
    }

    const requestedAssetPath = decodeURIComponent(params["*"] ?? "");
    if (!isAllowedLive2DAssetPath(requestedAssetPath)) {
      return reply.code(400).send({ error: "invalid_live2d_asset_path" });
    }

    const fullPath = resolve(model.baseDir, requestedAssetPath);
    const baseDir = await realpath(model.baseDir).catch(() => null);
    const realAsset = await realpath(fullPath).catch(() => null);
    if (!baseDir || !realAsset || !isPathInside(baseDir, realAsset)) {
      return reply.code(403).send({ error: "live2d_asset_not_allowed" });
    }

    return reply.type(contentTypeForLive2DAsset(realAsset)).send(createReadStream(realAsset));
  });

  server.post("/models/import", async (request, reply) => {
    const payload = importModelSchema.parse(request.body);
    if (!payload.entryPath.endsWith(".model3.json")) {
      return reply.code(400).send({ error: "invalid_model_suffix" });
    }
    if (!(await isAllowedModelFile(payload.entryPath, options.modelSearchRoots))) {
      return reply.code(403).send({ error: "model_root_not_allowed" });
    }
    const manifest = await parseModel3ManifestFile(payload.entryPath);
    const validation = await validateModelAssets(manifest);
    const capabilities = detectCapabilities(manifest);
    const model = {
      id: stableId(payload.entryPath, manifest.modelHash),
      entryPath: payload.entryPath,
      baseDir: manifest.baseDir,
      displayName: payload.displayName ?? basename(payload.entryPath, ".model3.json"),
      modelHash: manifest.modelHash,
      manifestJson: JSON.stringify(manifest),
      validationReportJson: JSON.stringify(validation)
    };
    storage.upsertLive2DModel(model);
    seedDefaultMappings(storage, model.id, manifest);
    return { ok: true, model, manifest, capabilities, validation };
  });

  server.post("/models/motion-mappings", async (request) => {
    const payload = mappingSchema.parse(request.body);
    for (const mapping of payload.mappings) {
      storage.upsertMotionMapping({
        id: mapping.id ?? stableId(payload.modelId, mapping.semantic),
        modelId: payload.modelId,
        semantic: mapping.semantic,
        groupName: mapping.groupName,
        motionIndex: mapping.motionIndex ?? null,
        priority: mapping.priority
      });
    }
    return { ok: true, mappings: storage.getMotionMappings(payload.modelId) };
  });

  server.post("/models/expression-mappings", async (request) => {
    const payload = expressionMappingSchema.parse(request.body);
    for (const mapping of payload.mappings) {
      storage.upsertExpressionMapping({
        id: mapping.id ?? stableId(payload.modelId, mapping.emotion),
        modelId: payload.modelId,
        emotion: mapping.emotion,
        expressionName: mapping.expressionName
      });
    }
    return { ok: true, mappings: storage.getExpressionMappings(payload.modelId) };
  });

  server.delete("/models/:id", async (request) => {
    const { id } = request.params as { id: string };
    storage.deleteLive2DModel(id);
    return { ok: true };
  });
}

export function isAllowedLive2DAssetPath(path: string): boolean {
  if (!path || path.includes("\0") || isAbsolute(path)) {
    return false;
  }
  const normalized = path.replace(/\\/g, "/");
  if (normalized.split("/").some((segment) => segment === "..")) {
    return false;
  }
  const lower = normalized.toLowerCase();
  return LIVE2D_ASSET_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export async function isAllowedModelRoot(root: string, allowedRoots: string[]): Promise<boolean> {
  if (allowedRoots.length === 0) {
    return false;
  }
  const requestedRoot = await realpath(root).catch(() => null);
  if (!requestedRoot) {
    return false;
  }
  for (const allowedRoot of allowedRoots) {
    const resolvedAllowedRoot = await realpath(allowedRoot).catch(() => null);
    if (!resolvedAllowedRoot) {
      continue;
    }
    const pathFromAllowedRoot = relative(resolvedAllowedRoot, requestedRoot);
    if (pathFromAllowedRoot === "" || (!pathFromAllowedRoot.startsWith("..") && !isAbsolute(pathFromAllowedRoot))) {
      return true;
    }
  }
  return false;
}

async function isAllowedModelFile(entryPath: string, allowedRoots: string[]): Promise<boolean> {
  const realEntry = await realpath(entryPath).catch(() => null);
  if (!realEntry) {
    return false;
  }
  for (const root of allowedRoots) {
    const realRoot = await realpath(root).catch(() => null);
    if (!realRoot) {
      continue;
    }
    const pathFromRoot = relative(realRoot, realEntry);
    if (pathFromRoot && !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot)) {
      return true;
    }
  }
  return false;
}

async function findModel3Files(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name.endsWith(".model3.json")) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

function seedDefaultMappings(storage: AppStorage, modelId: string, manifest: { motions: Array<{ group: string; index: number }>; expressions: Array<{ name: string }> }): void {
  const idle = manifest.motions.find((motion) => motion.group.toLowerCase() === "idle") ?? manifest.motions[0];
  const tap = manifest.motions.find((motion) => /tap|body/i.test(motion.group)) ?? idle;
  if (idle) {
    storage.upsertMotionMapping({ id: stableId(modelId, "idle"), modelId, semantic: "idle", groupName: idle.group, motionIndex: idle.index, priority: "idle" });
  }
  if (tap) {
    for (const semantic of ["speaking", "tapBody", "happy"]) {
      storage.upsertMotionMapping({ id: stableId(modelId, semantic), modelId, semantic, groupName: tap.group, motionIndex: tap.index, priority: "normal" });
    }
  }
  for (const emotion of ["joy", "fun", "anger", "sorrow", "surprised", "thinking", "neutral"]) {
    const expression = manifest.expressions.find((entry) => entry.name.toLowerCase().includes(emotion)) ?? manifest.expressions[0];
    if (expression) {
      storage.upsertExpressionMapping({ id: stableId(modelId, emotion), modelId, emotion, expressionName: expression.name });
    }
  }
}

function stableId(...parts: string[]): string {
  return `live2d_${createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 16)}`;
}

function isPathInside(baseDir: string, path: string): boolean {
  const pathFromBase = relative(baseDir, path);
  return pathFromBase === "" || (!pathFromBase.startsWith("..") && !isAbsolute(pathFromBase));
}

function contentTypeForLive2DAsset(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".moc3")) return "application/octet-stream";
  return "application/json; charset=utf-8";
}
