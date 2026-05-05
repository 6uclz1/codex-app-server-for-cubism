import { describe, expect, it } from "vitest";
import { CharacterStateMachine } from "./CharacterStateMachine.js";
import { CharacterDirectiveRouter } from "./CharacterDirectiveRouter.js";
import { RuntimeEventBus } from "./RuntimeEventBus.js";

describe("CharacterStateMachine", () => {
  it("turns character events into Live2D commands through runtime states", () => {
    const machine = new CharacterStateMachine();
    expect(machine.state).toBe("booting");
    expect(machine.dispatch({ type: "model.loaded" })).toEqual([
      { type: "motion.play", request: { semantic: "idle", priority: "idle" } }
    ]);
    expect(machine.state).toBe("idle");
    expect(machine.dispatch({ type: "user.message.started" })).toEqual([
      { type: "expression.set", semantic: "thinking", intensity: 0.7 },
      { type: "motion.play", request: { semantic: "thinking", priority: "normal" } }
    ]);
    expect(machine.state).toBe("thinking");
    expect(machine.dispatch({ type: "assistant.completed", directive: { text: "Hi", emotion: "joy", intensity: 0.9, speakingStyle: "normal" } })).toEqual(
      expect.arrayContaining([
        { type: "expression.set", semantic: "joy", intensity: 0.9 },
        { type: "motion.play", request: { semantic: "speaking", priority: "normal" } }
      ])
    );
    expect(machine.state).toBe("speaking");
    expect(machine.dispatch({ type: "voice.input.started" })).toEqual(
      expect.arrayContaining([{ type: "motion.play", request: { semantic: "interrupted", priority: "force" } }])
    );
    expect(machine.state).toBe("interrupted");
  });

  it("routes directives and event bus messages without renderer state", () => {
    const router = new CharacterDirectiveRouter();
    expect(router.route({ text: "Done", emotion: "fun", intensity: 1, speakingStyle: "energetic", motion: { semantic: "happy" } })).toEqual(
      expect.arrayContaining([{ type: "motion.play", request: { semantic: "happy", priority: "normal" } }])
    );

    const bus = new RuntimeEventBus<{ type: "ping"; value: number }>();
    const seen: number[] = [];
    const unsubscribe = bus.subscribe((event) => seen.push(event.value));
    bus.emit({ type: "ping", value: 1 });
    unsubscribe();
    bus.emit({ type: "ping", value: 2 });
    expect(seen).toEqual([1]);
  });
});
