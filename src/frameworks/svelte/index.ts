import { FrameworkType } from "../interfaces";
import { initViteTemplate, vitePluginDiscover } from "../vite";

export * from "../vite";

export const name = "Svelte";
export const type = FrameworkType.Framework;

export const init = initViteTemplate("svelte");
export const discover = vitePluginDiscover("vite-plugin-svelte");
