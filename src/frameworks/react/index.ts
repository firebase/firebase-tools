import { FrameworkType } from "../interfaces";
import { initViteTemplate, vitePluginDiscover } from "../vite";

export * from "../vite";

export const name = "React";
export const type = FrameworkType.Framework;

export const init = initViteTemplate("react");
export const discover = vitePluginDiscover("vite:react-jsx");
