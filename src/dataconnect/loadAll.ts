import { load, readFirebaseJson } from "./load";
import type { Config } from "../config";

export function loadAll(projectId: string, config: Config) {
  const configs = readFirebaseJson(config);
  return Promise.all(configs.map((c) => load(projectId, config, c.source)));
}
