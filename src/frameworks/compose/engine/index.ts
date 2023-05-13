import { AppSpec, Engine } from "../interfaces";
import { LocalEngine } from "./local";
import { DockerEngine } from "./docker";

export const SUPPORTED_MODES = ["local", "docker"] as const;
export type EngineMode = (typeof SUPPORTED_MODES)[number];

/**
 * Returns engine that drives the execution context for the build
 */
export function getEngine(mode: EngineMode, app: AppSpec): Engine {
  if (mode === "local") {
    return new LocalEngine(app);
  } else if (mode === "docker") {
    return new DockerEngine(app);
  }
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unsupported mode ${mode}`);
}
