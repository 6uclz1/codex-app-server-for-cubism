import type { CubismDesktopApi } from "../../preload/preload.js";

declare module "live2dcubismcore";
declare module "live2dcubismcore/live2dcubismcore.min.js?url" {
  const url: string;
  export default url;
}

declare global {
  interface Window {
    cubism: CubismDesktopApi;
    PIXI?: unknown;
    Live2DCubismCore?: unknown;
  }
}
