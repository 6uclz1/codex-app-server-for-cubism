import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseModel3Manifest, validateModelAssets } from "./ModelManifest.js";
import { detectCapabilities } from "./ModelCapability.js";
import { resolveMotionRequest } from "./CharacterMotionPolicy.js";
import { expressionCandidatesForEmotion, resolveExpressionRequest } from "./CharacterExpressionPolicy.js";
import { bindLipSyncParameters, normalizeParameterValue } from "./ParameterBinding.js";

describe("Live2D model manifest domain", () => {
  it("normalizes model3.json references and detects model capabilities", () => {
    const manifest = parseModel3Manifest(
      "/models/Hiyori/Hiyori.model3.json",
      {
        Version: 3,
        FileReferences: {
          Moc: "Hiyori.moc3",
          Textures: ["textures/texture_00.png"],
          Physics: "Hiyori.physics3.json",
          Pose: "Hiyori.pose3.json",
          UserData: "Hiyori.userdata3.json",
          Motions: {
            Idle: [{ File: "motions/idle_01.motion3.json", FadeInTime: 0.5 }],
            TapBody: [{ File: "motions/tap.motion3.json", Sound: "tap.wav" }]
          },
          Expressions: [{ Name: "happy", File: "expressions/happy.exp3.json" }]
        },
        Groups: [
          { Target: "Parameter", Name: "LipSync", Ids: ["ParamMouthOpenY"] },
          { Target: "Parameter", Name: "EyeBlink", Ids: ["ParamEyeLOpen", "ParamEyeROpen"] }
        ],
        HitAreas: [{ Id: "Head", Name: "head" }]
      }
    );

    expect(manifest.baseDir).toBe("/models/Hiyori");
    expect(manifest.moc.file).toBe("Hiyori.moc3");
    expect(manifest.motions).toEqual([
      expect.objectContaining({ group: "Idle", index: 0, file: "motions/idle_01.motion3.json", fadeInMs: 500 }),
      expect.objectContaining({ group: "TapBody", index: 0, sound: "tap.wav" })
    ]);
    expect(manifest.expressions).toEqual([{ name: "happy", file: "expressions/happy.exp3.json" }]);

    expect(detectCapabilities(manifest)).toEqual(
      expect.objectContaining({
        hasPhysics: true,
        hasExpressions: true,
        motionGroups: ["Idle", "TapBody"],
        lipSyncParameters: ["ParamMouthOpenY"],
        eyeBlinkParameters: ["ParamEyeLOpen", "ParamEyeROpen"],
        hitAreas: [{ id: "Head", name: "head" }]
      })
    );
  });

  it("validates missing assets and blocks path traversal references", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cubism-domain-"));
    await mkdir(join(dir, "textures"), { recursive: true });
    await writeFile(join(dir, "Avatar.moc3"), "");
    await writeFile(join(dir, "textures", "texture_00.png"), "");

    const manifest = parseModel3Manifest(join(dir, "Avatar.model3.json"), {
      FileReferences: {
        Moc: "Avatar.moc3",
        Textures: ["textures/texture_00.png"],
        Motions: { Idle: [{ File: "../escape.motion3.json" }, { File: "motions/missing.motion3.json" }] },
        Expressions: [{ Name: "joy", File: "expressions/missing.exp3.json" }]
      }
    });

    const report = await validateModelAssets(manifest);
    expect(report.ok).toBe(false);
    expect(report.unsupported).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "path_traversal" })]));
    expect(report.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "motions/missing.motion3.json" }),
        expect.objectContaining({ file: "expressions/missing.exp3.json" })
      ])
    );
  });

  it("resolves semantic motions and expression aliases against model catalogs", () => {
    const manifest = parseModel3Manifest("/m/A.model3.json", {
      FileReferences: {
        Moc: "A.moc3",
        Textures: ["t.png"],
        Motions: { Idle: [{ File: "idle.motion3.json" }], TapBody: [{ File: "tap.motion3.json" }] },
        Expressions: [{ Name: "happy", File: "happy.exp3.json" }]
      }
    });

    expect(resolveMotionRequest(manifest, { semantic: "tapBody", priority: "normal" })).toEqual(
      expect.objectContaining({ group: "TapBody", index: 0 })
    );
    expect(expressionCandidatesForEmotion("joy")).toEqual(["joy", "happy", "fun"]);
    expect(resolveExpressionRequest(manifest, { semantic: "joy" })).toEqual({ name: "happy", intensity: 1 });
  });

  it("binds model-aware lip sync parameters with fallback and clamps values", () => {
    expect(bindLipSyncParameters([], 0.8)).toEqual([{ id: "ParamMouthOpenY", value: 0.8, weight: 1 }]);
    expect(bindLipSyncParameters(["ParamA", "ParamB"], 2, 0.4)).toEqual([
      { id: "ParamA", value: 1, weight: 0.4 },
      { id: "ParamB", value: 1, weight: 0.4 }
    ]);
    expect(normalizeParameterValue(Number.NaN)).toBe(0);
  });
});
