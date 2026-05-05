# Live2D Model Format

The app treats `.model3.json` as the model entrypoint.

`model3.json` references the rest of a Live2D model package, including:

- `.moc3` model data
- texture files
- motion groups
- expression files
- optional physics and user data files

The initial controller contract is intentionally small:

```ts
type CharacterState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface Live2DController {
  loadModel(model3JsonPath: string): Promise<void>;
  setState(state: CharacterState): void;
  playMotion(group: string, index?: number): void;
  setExpression(name: string): void;
  setLipSync(value: number): void;
  setGaze(x: number, y: number): void;
}
```

The current renderer uses a canvas fallback so the app can be developed and tested without bundling licensed sample models. The package boundary is ready for Cubism SDK for Web integration.
