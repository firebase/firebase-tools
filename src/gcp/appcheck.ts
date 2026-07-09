import * as fs from "fs";

import { Client } from "../apiv2";
import { appCheckOrigin } from "../api";
import { FirebaseError, getErrStatus } from "../error";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as iam from "./iam";
import { logger } from "../logger";
import { confirm } from "../prompt";

export const API_VERSION = "v1";
export const APP_CHECK_API = "firebaseappcheck.googleapis.com";

const PREFIX = "appcheck";

export const client = new Client({
  urlPrefix: appCheckOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

/** Developer-facing enforcement mode, mapped to the API `enforcementMode` enum. */
export type EnforcementMode = "off" | "unenforced" | "enforced";

const ENFORCEMENT_MODE_TO_API: Record<EnforcementMode, string> = {
  off: "OFF",
  unenforced: "UNENFORCED",
  enforced: "ENFORCED",
};

const API_TO_ENFORCEMENT_MODE: Record<string, EnforcementMode> = {
  OFF: "off",
  UNENFORCED: "unenforced",
  ENFORCED: "enforced",
};

/**
 * Developer-facing service aliases mapped to the underlying App Check service
 * resource IDs. The alias is what users type; the resource ID is the last path
 * segment of `projects/{project}/services/{serviceId}`.
 */
export const SERVICE_ALIAS_TO_ID: Record<string, string> = {
  database: "firebasedatabase.googleapis.com",
  firestore: "firestore.googleapis.com",
  storage: "firebasestorage.googleapis.com",
  auth: "identitytoolkit.googleapis.com",
  ailogic: "firebasevertexai.googleapis.com",
  functions: "cloudfunctions.googleapis.com",
};

const SERVICE_ID_TO_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(SERVICE_ALIAS_TO_ID).map(([alias, id]) => [id, alias]),
);

/** Resolves a service alias (or a raw resource ID) to its resource ID. */
export function resolveServiceId(service: string): string {
  if (SERVICE_ALIAS_TO_ID[service]) {
    return SERVICE_ALIAS_TO_ID[service];
  }
  if (SERVICE_ID_TO_ALIAS[service]) {
    return service; // already a known resource ID
  }
  throw new FirebaseError(
    `Unknown service: ${service}\n\nValid services:\n\n` +
      Object.keys(SERVICE_ALIAS_TO_ID)
        .map((a) => `  ${a}`)
        .join("\n"),
  );
}

/** Returns the alias for a resource ID, falling back to the resource ID itself. */
export function aliasForServiceId(serviceId: string): string {
  return SERVICE_ID_TO_ALIAS[serviceId] ?? serviceId;
}

/**
 * Services that Firebase enforces automatically and that should stay enforced.
 * As of early July 2026, Firebase auto-enforces App Check for AI Logic during the
 * guided setup workflow, because it directly protects the Gemini API from abuse.
 * Relaxing enforcement on these services is discouraged and confirmation-gated.
 */
export const AUTO_ENFORCED_SERVICE_IDS = new Set<string>(["firebasevertexai.googleapis.com"]);

/** Whether the service is one Firebase auto-enforces and should stay enforced. */
export function isAutoEnforcedService(service: string): boolean {
  return AUTO_ENFORCED_SERVICE_IDS.has(resolveServiceId(service));
}

/** Parses a developer-facing enforcement mode string, throwing on invalid input. */
export function parseEnforcementMode(mode: string): EnforcementMode {
  const normalized = mode.toLowerCase();
  if (normalized === "off" || normalized === "unenforced" || normalized === "enforced") {
    return normalized;
  }
  throw new FirebaseError(
    `Unknown enforcement mode: ${mode}\n\nValid modes:\n\n  off\n  unenforced\n  enforced`,
  );
}

export interface Service {
  name: string;
  enforcementMode: string;
}

export interface AppCheckService {
  serviceId: string;
  alias: string;
  enforcement: EnforcementMode;
}

function toAppCheckService(service: Service): AppCheckService {
  const serviceId = service.name.split("/").pop() ?? service.name;
  return {
    serviceId,
    alias: aliasForServiceId(serviceId),
    enforcement: API_TO_ENFORCEMENT_MODE[service.enforcementMode] ?? "off",
  };
}

/**
 * Gets the enforcement configuration for a single service.
 */
export async function getService(projectId: string, service: string): Promise<AppCheckService> {
  const serviceId = resolveServiceId(service);
  const res = await client.get<Service>(`projects/${projectId}/services/${serviceId}`);
  return toAppCheckService(res.body);
}

/**
 * Lists the enforcement configuration for every enforceable service.
 */
export async function listServices(projectId: string): Promise<AppCheckService[]> {
  const res = await client.get<{ services?: Service[] }>(`projects/${projectId}/services`);
  return (res.body?.services ?? []).map(toAppCheckService);
}

/**
 * Sets the enforcement mode for a single service.
 */
export async function setServiceEnforcement(
  projectId: string,
  service: string,
  mode: EnforcementMode,
): Promise<AppCheckService> {
  const serviceId = resolveServiceId(service);
  const res = await client.patch<Partial<Service>, Service>(
    `projects/${projectId}/services/${serviceId}`,
    { enforcementMode: ENFORCEMENT_MODE_TO_API[mode] },
    { queryParams: { updateMask: "enforcementMode" } },
  );
  return toAppCheckService(res.body);
}

export interface DebugToken {
  name?: string;
  displayName: string;
  token?: string;
}

/**
 * Creates a debug token for an app. The returned token value is only available
 * once, at creation time.
 */
export async function createDebugToken(
  projectId: string,
  appId: string,
  displayName: string,
  token?: string,
): Promise<DebugToken> {
  const body: DebugToken = { displayName };
  if (token) {
    body.token = token;
  }
  const res = await client.post<DebugToken, DebugToken>(
    `projects/${projectId}/apps/${appId}/debugTokens`,
    body,
  );
  return res.body;
}

/**
 * Lists an app's debug tokens. The API never returns the token value.
 */
export async function listDebugTokens(projectId: string, appId: string): Promise<DebugToken[]> {
  const res = await client.get<{ debugTokens?: DebugToken[] }>(
    `projects/${projectId}/apps/${appId}/debugTokens`,
  );
  return res.body?.debugTokens ?? [];
}

/**
 * Deletes a debug token by its ID.
 */
export async function deleteDebugToken(
  projectId: string,
  appId: string,
  tokenId: string,
): Promise<void> {
  await client.delete<void>(`projects/${projectId}/apps/${appId}/debugTokens/${tokenId}`);
}

export type ProviderType =
  | "app-attest"
  | "device-check"
  | "play-integrity"
  | "recaptcha-enterprise"
  | "recaptcha-v3";

export type AppCheckPlatform = "IOS" | "ANDROID" | "WEB";

interface ProviderMeta {
  /** The App Check per-app config sub-resource, e.g. "appAttestConfig". */
  configResource: string;
  /** The app platforms this provider can attest. */
  platforms: AppCheckPlatform[];
}

// As of June 2026, reCAPTCHA Enterprise is an attestation provider for mobile
// (iOS, and Android as backend support rolls out) in addition to web, so it is
// no longer web-only. reCAPTCHA v3 remains web-only.
export const PROVIDER_META: Record<ProviderType, ProviderMeta> = {
  "app-attest": { configResource: "appAttestConfig", platforms: ["IOS"] },
  "device-check": { configResource: "deviceCheckConfig", platforms: ["IOS"] },
  "play-integrity": { configResource: "playIntegrityConfig", platforms: ["ANDROID"] },
  "recaptcha-enterprise": {
    configResource: "recaptchaEnterpriseConfig",
    platforms: ["IOS", "ANDROID", "WEB"],
  },
  "recaptcha-v3": { configResource: "recaptchaV3Config", platforms: ["WEB"] },
};

/** Parses a provider type string, throwing on an unknown provider. */
export function parseProviderType(provider: string): ProviderType {
  if (provider in PROVIDER_META) {
    return provider as ProviderType;
  }
  throw new FirebaseError(
    `Unknown provider: ${provider}\n\nValid providers:\n\n` +
      Object.keys(PROVIDER_META)
        .map((p) => `  ${p}`)
        .join("\n"),
  );
}

export interface ProviderConfig {
  name?: string;
  tokenTtl?: string;
  // recaptcha-enterprise
  siteKey?: string;
  // recaptcha-v3
  siteSecretSet?: boolean;
  // device-check
  keyId?: string;
  privateKeySet?: boolean;
}

/**
 * Gets the provider config sub-resource for an app. Returns null if the provider
 * has not been configured (404).
 */
export async function getProviderConfig(
  projectId: string,
  appId: string,
  provider: ProviderType,
): Promise<ProviderConfig | null> {
  const { configResource } = PROVIDER_META[provider];
  try {
    const res = await client.get<ProviderConfig>(
      `projects/${projectId}/apps/${appId}/${configResource}`,
    );
    return res.body;
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Registers or updates a provider config for an app. `fields` carries the
 * provider-specific inputs (siteKey, siteSecret, keyId, privateKey, tokenTtl).
 */
export async function setProviderConfig(
  projectId: string,
  appId: string,
  provider: ProviderType,
  fields: Record<string, string>,
): Promise<ProviderConfig> {
  const { configResource } = PROVIDER_META[provider];
  const updateMask = Object.keys(fields).join(",");
  const res = await client.patch<Record<string, string>, ProviderConfig>(
    `projects/${projectId}/apps/${appId}/${configResource}`,
    fields,
    { queryParams: { updateMask } },
  );
  return res.body;
}

/** Whether the provider can attest an app of the given platform. */
export function providerSupportsPlatform(provider: ProviderType, platform: string): boolean {
  return PROVIDER_META[provider].platforms.some((p) => p === platform);
}

/** The provider types that can attest an app of the given platform. */
export function providersForPlatform(platform: string): ProviderType[] {
  return (Object.keys(PROVIDER_META) as ProviderType[]).filter((p) =>
    providerSupportsPlatform(p, platform),
  );
}

export interface ConfiguredProvider {
  provider: ProviderType;
  config: ProviderConfig;
}

/**
 * Best-effort probe of which platform-relevant providers have a config for an
 * app, with each config. Providers are probed in parallel.
 */
export async function listConfiguredProviders(
  projectId: string,
  appId: string,
  platform: string,
): Promise<ConfiguredProvider[]> {
  const candidates = providersForPlatform(platform);
  const configs = await Promise.all(
    candidates.map((provider) => getProviderConfig(projectId, appId, provider)),
  );
  const configured: ConfiguredProvider[] = [];
  candidates.forEach((provider, i) => {
    const config = configs[i];
    if (config) {
      configured.push({ provider, config });
    }
  });
  return configured;
}

/** The platform-relevant provider types that have a config for an app. */
export async function getConfiguredProviders(
  projectId: string,
  appId: string,
  platform: string,
): Promise<ProviderType[]> {
  const configured = await listConfiguredProviders(projectId, appId, platform);
  return configured.map((c) => c.provider);
}

/**
 * Ensures the Firebase App Check API is enabled.
 * - Non-interactive mode: throws with instructions.
 * - Interactive mode: prompts to enable it, checking enablement permission first.
 * Read-only commands should NOT call this; they should degrade gracefully.
 */
export async function ensureAppCheckApiEnabled(
  projectId: string,
  options: { nonInteractive?: boolean; force?: boolean },
): Promise<void> {
  const isEnabled = await ensureApiEnabled.check(projectId, APP_CHECK_API, PREFIX, true);
  if (isEnabled) {
    return;
  }

  if (options.nonInteractive) {
    throw new FirebaseError(
      `The Firebase App Check API (${APP_CHECK_API}) is not enabled on project ${projectId}.\n\n` +
        `Enable it by rerunning this command in an interactive terminal, or enable the API in ` +
        `the Google Cloud console:\n\n` +
        `  https://console.cloud.google.com/apis/library/${APP_CHECK_API}?project=${projectId}\n\n` +
        `Then run this command again.`,
    );
  }

  const { missing } = await iam.testIamPermissions(projectId, ["serviceusage.services.enable"]);
  if (missing.length > 0) {
    throw new FirebaseError(
      `You do not have permission to enable the Firebase App Check API on project ${projectId}.\n\n` +
        `Missing permission: ${missing.join(", ")}\n\n` +
        `This permission is included in the Owner and Editor roles. Ask a project ` +
        `administrator to enable the API or grant you the permission, then run this command again.`,
    );
  }

  logger.info(
    `The Firebase App Check API (${APP_CHECK_API}) is not enabled on project ${projectId}.`,
  );
  const proceed = await confirm({ message: "Would you like to enable it now?", default: true });
  if (!proceed) {
    throw new FirebaseError("Command aborted.", { exit: 1 });
  }
  logger.info(`Enabling ${APP_CHECK_API}...`);
  await ensureApiEnabled.ensure(projectId, APP_CHECK_API, PREFIX);
}

/**
 * Resolves a secret flag value. A value beginning with "@" is read from the file
 * path that follows (so secrets stay out of shell history and CI logs); any other
 * value is treated as the literal secret. Surrounding whitespace/newlines from a
 * file are trimmed.
 */
export function resolveSecretFlag(value: string): string {
  if (!value.startsWith("@")) {
    return value;
  }
  const filePath = value.slice(1);
  if (!fs.existsSync(filePath)) {
    throw new FirebaseError(`Secret file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8").trim();
}

/**
 * Parses a short duration ("1h", "30m", "3600s", "3600") into the API Duration
 * string form ("3600s").
 */
export function parseTokenTtl(ttl: string): string {
  const match = /^(\d+(?:\.\d+)?)(s|m|h|d)?$/.exec(ttl.trim());
  if (!match) {
    throw new FirebaseError(`Invalid token TTL: ${ttl}. Use a value like 1h, 30m, or 3600s.`);
  }
  const value = Number(match[1]);
  const unit = match[2] ?? "s";
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  // The App Check API expects an integer number of seconds.
  return `${Math.round(value * multipliers[unit])}s`;
}

/** Formats a Duration string ("3600s") as a short human label ("1h"). */
export function formatTokenTtl(ttl?: string): string {
  if (!ttl) {
    return "-";
  }
  const match = /^(\d+(?:\.\d+)?)s$/.exec(ttl);
  if (!match) {
    return ttl;
  }
  const seconds = Number(match[1]);
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}
