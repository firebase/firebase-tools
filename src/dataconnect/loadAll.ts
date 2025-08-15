import { load } from "./load";
import type { Config } from "../config";
import { readFirebaseJson } from "./fileUtils";

export function loadAll(projectId: string, config: Config) {
  const configs = readFirebaseJson(config);
  return Promise.all(configs.map((c) => load(projectId, config, c.source)));
}
