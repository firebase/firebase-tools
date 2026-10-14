import { Driver } from "../interfaces";
import { LocalDriver } from "./local";
import { DockerDriver } from "./docker";
import { RuntimeSpec } from "../discover/types";

export const SUPPORTED_MODES = ["local", "docker"] as const;
export type Mode = (typeof SUPPORTED_MODES)[number];

/**
 * Returns the driver that provides the execution context for the composer.
 */
export function getDriver(mode: Mode, app: RuntimeSpec): Driver {
  if (mode === "local") {
    return new LocalDriver(app);
  } else if (mode === "docker") {
    return new DockerDriver(app);
  }
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unsupported mode ${mode}`);
}
