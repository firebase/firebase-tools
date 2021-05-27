import { Config } from "./config";

export interface Options {
  config: Config;

  // TODO(samstern): Remove this once options is better typed
  [key: string]: any;
}
