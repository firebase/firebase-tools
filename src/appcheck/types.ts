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

/** The ways an app can prove it is real. */
export type ProviderType =
  | "app-attest"
  | "device-check"
  | "play-integrity"
  | "recaptcha-enterprise"
  | "recaptcha-v3";

/** The app platforms App Check can attest. */
export type AppCheckPlatform = "IOS" | "ANDROID" | "WEB";

/** What we know about one provider, apart from an app's settings for it. */
export interface ProviderMeta {
  /** The per app config sub resource, for example "appAttestConfig". */
  configResource: string;
  /** The app platforms this provider can attest. */
  platforms: AppCheckPlatform[];
  /** Human readable name for tables and messages. */
  label: string;
}

/**
 * One provider config for one app.
 *
 * All five config resources share `name` and `tokenTtl`; the rest of the fields
 * belong to one provider each. Secrets are input only: the API never returns
 * `privateKey` or `siteSecret`, only the `...Set` booleans.
 */
export interface ProviderConfig {
  name?: string;
  tokenTtl?: string;
  // device-check
  keyId?: string;
  privateKey?: string;
  privateKeySet?: boolean;
  // recaptcha-v3
  siteSecret?: string;
  siteSecretSet?: boolean;
  minValidScore?: number;
  // recaptcha-enterprise
  siteKey?: string;
  riskAnalysis?: { minValidScore?: number };
  // play-integrity
  appIntegrity?: { allowUnrecognizedVersion?: boolean };
  deviceIntegrity?: { minDeviceRecognitionLevel?: string };
  accountDetails?: { requireLicensed?: boolean };
}

/** The provider settings a user can pass on the command line. */
export interface ProviderFlags {
  tokenTtl?: string;
  keyId?: string;
  privateKey?: string;
  siteKey?: string;
  siteSecret?: string;
  minScore?: string;
  minDeviceIntegrity?: string;
  requireLicensed?: boolean;
  allowUnrecognizedVersion?: boolean;
}

export interface AppCheckProviderOptions extends Options, ProviderFlags {
  app?: string;
}
