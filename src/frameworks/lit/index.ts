import { FrameworkType } from "../interfaces";
import { initViteTemplate, viteDiscoverWithNpmDependency } from "../vite";

export * from "../vite";

export const name = "Lit";
export const type = FrameworkType.Framework;

export const init = initViteTemplate("lit");
export const discover = viteDiscoverWithNpmDependency("lit");
