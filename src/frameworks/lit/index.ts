import { FrameworkType } from "../interfaces.js";
import { initViteTemplate, viteDiscoverWithNpmDependency } from "../vite/index.js";

export * from "../vite/index.js";

export const name = "Lit";
export const type = FrameworkType.Framework;

export const init = initViteTemplate("lit");
export const discover = viteDiscoverWithNpmDependency("lit");
