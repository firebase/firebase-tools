import { FrameworkType } from "../interfaces";
import { initViteTemplate, vitePluginDiscover } from "../vite";

export * from "../vite";

export const name = "Preact";
export const type = FrameworkType.Framework;

export const init = initViteTemplate("preact");
export const discover = vitePluginDiscover("vite:preact-jsx");
