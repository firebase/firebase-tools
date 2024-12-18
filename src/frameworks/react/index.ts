import { FrameworkType } from "../interfaces.js";
import { initViteTemplate, vitePluginDiscover } from "../vite/index.js";

export * from "../vite/index.js";

export const name = "React";
export const type = FrameworkType.Framework;

export const init = initViteTemplate("react");
export const discover = vitePluginDiscover("vite:react-jsx");
