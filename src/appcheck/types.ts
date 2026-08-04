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

/** How App Check treats requests to a service. */
export type EnforcementMode = "OFF" | "UNENFORCED" | "ENFORCED";

/**
 * App Check settings for one service.
 *
 * A service that was never configured still answers a GET, but with no
 * `enforcementMode` at all, so the field is optional here.
 */
export interface Service {
  name: string;
  enforcementMode?: EnforcementMode;
  replayProtection?: EnforcementMode;
  updateTime?: string;
  etag?: string;
}

export interface AppCheckServiceOptions extends Options {
  replayProtection?: string;
}
