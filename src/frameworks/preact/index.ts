import { FrameworkType } from "../interfaces.js";
import { initViteTemplate, vitePluginDiscover } from "../vite/index.js";

export * from "../vite/index.js";

export const name = "Preact";
export const type = FrameworkType.Framework;

export const init = initViteTemplate("preact");
export const discover = vitePluginDiscover("vite:preact-jsx");
