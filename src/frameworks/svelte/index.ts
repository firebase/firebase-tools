import { FrameworkType } from "../interfaces.js";
import { initViteTemplate, vitePluginDiscover } from "../vite/index.js";

export * from "../vite/index.js";

export const name = "Svelte";
export const type = FrameworkType.Framework;

export const init = initViteTemplate("svelte");
export const discover = vitePluginDiscover("vite-plugin-svelte");
