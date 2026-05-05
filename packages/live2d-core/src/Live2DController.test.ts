import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { FallbackLive2DController } from "./Live2DController.js";

describe("FallbackLive2DController", () => {
  it("loads model3.json as the model entrypoint and tracks character state", async () => {
    const dir = join(tmpdir(), `live2d-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const modelPath = join(dir, "Avatar.model3.json");
    await writeFile(
      modelPath,
      JSON.stringify({
        Version: 3,
        FileReferences: {
          Moc: "Avatar.moc3",
          Textures: ["Avatar.2048/texture_00.png"],
          Motions: { Idle: [{ File: "motions/idle.motion3.json" }] },
          Expressions: [{ Name: "happy", File: "expressions/happy.exp3.json" }]
        }
      })
    );

    const controller = new FallbackLive2DController();
    await controller.loadModel(modelPath);
    controller.setState("speaking");
    controller.setExpression("happy");
    controller.setLipSync(2);
    controller.setGaze(0.25, -0.5);

    expect(controller.snapshot.modelPath).toBe(modelPath);
    expect(controller.snapshot.state).toBe("speaking");
    expect(controller.snapshot.expression).toBe("happy");
    expect(controller.snapshot.lipSync).toBe(1);
    expect(controller.snapshot.gaze).toEqual({ x: 0.25, y: -0.5 });
  });
});
