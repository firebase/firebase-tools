import { AppSpec, Driver } from "../interfaces";
import { LocalDriver } from "./local";
import { DockerDriver } from "./docker";

export const SUPPORTED_MODES = ["local", "docker"] as const;
export type EngineMode = (typeof SUPPORTED_MODES)[number];

/**
 * Returns engine that drives the execution context for the build
 */
export function getEngine(mode: EngineMode, app: AppSpec): Driver {
  if (mode === "local") {
    return new LocalDriver(app);
  } else if (mode === "docker") {
    return new DockerDriver(app);
  }
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unsupported mode ${mode}`);
}
