import { Options } from "../options";

export interface DebugToken {
  name: string;
  displayName: string;
  token: string;
  updateTime?: string;
}

export interface ListDebugTokensResponse {
  debugTokens?: DebugToken[];
  nextPageToken?: string;
}

export interface AppCheckDebugOptions extends Options {
  app?: string;
  displayName?: string;
}
