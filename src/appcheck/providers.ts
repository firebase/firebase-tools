import * as fs from "fs";

import { FirebaseError, getErrMsg, getError } from "../error";
import { ProviderConfig, ProviderFlags, ProviderMeta, ProviderType } from "./types";

const TTL_MIN_SECONDS = 30 * 60;
const TTL_MAX_SECONDS = 7 * 24 * 60 * 60;

/** Play Integrity device levels, as short CLI words. */
export const DEVICE_INTEGRITY_LEVELS: Record<string, string> = {
  none: "NO_INTEGRITY",
  basic: "MEETS_BASIC_INTEGRITY",
  device: "MEETS_DEVICE_INTEGRITY",
  strong: "MEETS_STRONG_INTEGRITY",
};

export const PROVIDER_META: Record<ProviderType, ProviderMeta> = {
  "app-attest": { configResource: "appAttestConfig", platforms: ["IOS"], label: "App Attest" },
  "device-check": { configResource: "deviceCheckConfig", platforms: ["IOS"], label: "DeviceCheck" },
  "play-integrity": {
    configResource: "playIntegrityConfig",
    platforms: ["ANDROID"],
    label: "Play Integrity",
  },
  // Not web only: the mobile SDKs added a reCAPTCHA attestation provider in
  // June 2026, and it uses this same config resource.
  "recaptcha-enterprise": {
    configResource: "recaptchaEnterpriseConfig",
    platforms: ["IOS", "ANDROID", "WEB"],
    label: "reCAPTCHA Enterprise",
  },
  "recaptcha-v3": {
    configResource: "recaptchaV3Config",
    platforms: ["WEB"],
    label: "reCAPTCHA v3",
  },
};

export const ATTESTATION_PROVIDERS: readonly ProviderType[] = [
  "app-attest",
  "device-check",
  "play-integrity",
  "recaptcha-enterprise",
  "recaptcha-v3",
] as const;

/** The provider list, for help text and error messages. */
export function providerHelp(): string {
  return ATTESTATION_PROVIDERS.map(
    (p) => `  ${p.padEnd(22)} ${PROVIDER_META[p].label} (${PROVIDER_META[p].platforms.join(", ")})`,
  ).join("\n");
}

/** Validates a provider name, listing the valid ones when it is wrong. */
export function parseProviderType(provider: string): ProviderType {
  if (provider in PROVIDER_META) {
    return provider as ProviderType;
  }
  throw new FirebaseError(`Unknown provider: ${provider}\n\nValid providers:\n\n${providerHelp()}`);
}

/** Whether the provider can attest an app of this platform. */
function providerSupportsPlatform(provider: ProviderType, platform: string): boolean {
  return PROVIDER_META[provider].platforms.some((p) => p === platform);
}

/** The providers that can attest an app of this platform. */
export function providersForPlatform(platform: string): ProviderType[] {
  return ATTESTATION_PROVIDERS.filter((p) => providerSupportsPlatform(p, platform));
}

/** Rejects a provider that does not work on the app's platform. */
export function assertProviderSupportsPlatform(
  provider: ProviderType,
  platform: string,
  appId: string,
): void {
  if (providerSupportsPlatform(provider, platform)) {
    return;
  }
  const supported = providersForPlatform(platform);
  const platformName = platform.charAt(0) + platform.slice(1).toLowerCase();
  throw new FirebaseError(
    `${provider} is a ${PROVIDER_META[provider].platforms.join("/")} provider. App ${appId} is a ${platformName} app.\n\n` +
      (supported.length
        ? `Providers for ${platformName} apps: ${supported.join(", ")}.`
        : `No App Check providers are available for ${platformName} apps.`),
  );
}

/**
 * Whether the app really uses this provider.
 *
 * A config resource always answers a GET, with defaults, even when nobody ever
 * touched it, so the presence of the resource proves nothing. The secret or key
 * fields are the only evidence. App Attest and Play Integrity have no such
 * field, so for those the honest answer is "we cannot tell".
 */
export function isConfigured(provider: ProviderType, config: ProviderConfig): boolean | null {
  switch (provider) {
    case "device-check":
      return Boolean(config.privateKeySet ?? config.keyId);
    case "recaptcha-v3":
      return Boolean(config.siteSecretSet);
    case "recaptcha-enterprise":
      return Boolean(config.siteKey);
    default:
      return null;
  }
}

/**
 * Turns `30m`, `2h`, `1d` or `3600s` into the seconds string the API wants.
 * The API accepts 30 minutes to 7 days.
 */
function parseTokenTtl(ttl: string): string {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) {
    throw new FirebaseError(
      `Invalid --token-ttl: ${ttl}. Use a number followed by s, m, h or d, for example 30m, 2h or 1d.`,
    );
  }
  const value = Number(match[1]);
  const unitSeconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = value * unitSeconds[match[2]];
  if (seconds < TTL_MIN_SECONDS || seconds > TTL_MAX_SECONDS) {
    throw new FirebaseError(
      `Invalid --token-ttl: ${ttl}. Must be between 30 minutes (30m) and 7 days (7d).`,
    );
  }
  return `${seconds}s`;
}

/** Shows a duration of seconds back as something readable, e.g. 3600s as 1h. */
export function formatTokenTtl(ttl?: string): string {
  if (!ttl) {
    return "default";
  }
  const seconds = Number(ttl.replace(/s$/, ""));
  if (!Number.isFinite(seconds)) {
    return ttl;
  }
  if (seconds % 86400 === 0) {
    return `${seconds / 86400}d`;
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

/**
 * Reads a secret flag. `@path` reads the file, anything else is the value.
 *
 * A private key pasted on the command line ends up in the shell history and in
 * process listings, so the file form is the one we document.
 */
function resolveSecretFlag(value: string): string {
  if (!value.startsWith("@")) {
    return value;
  }
  const path = value.slice(1);
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch (err: unknown) {
    throw new FirebaseError(`Could not read ${path}: ${getErrMsg(err)}`, {
      original: getError(err),
    });
  }
}

/** Parses a reCAPTCHA score threshold, which the API takes as 0.0 to 1.0. */
function parseMinScore(value: string): number {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new FirebaseError(`--min-score must be a number between 0.0 and 1.0.`);
  }
  return score;
}

/** Parses the short device integrity level into the API enum. */
function parseDeviceIntegrityLevel(level: string): string {
  const parsed = DEVICE_INTEGRITY_LEVELS[level.toLowerCase()];
  if (!parsed) {
    throw new FirebaseError(
      `Invalid --min-device-integrity: ${level}. Must be one of: ${Object.keys(
        DEVICE_INTEGRITY_LEVELS,
      ).join(", ")}.`,
    );
  }
  return parsed;
}

/** One line describing what is set on a provider config, for the list table. */
export function summarizeConfig(provider: ProviderType, config: ProviderConfig): string {
  switch (provider) {
    case "device-check":
      return config.keyId ? `key id: ${config.keyId}` : "";
    case "recaptcha-enterprise":
      return [
        config.siteKey ? `site key: ${config.siteKey}` : "",
        config.riskAnalysis?.minValidScore !== undefined
          ? `min score: ${config.riskAnalysis.minValidScore}`
          : "",
      ]
        .filter(Boolean)
        .join(", ");
    case "recaptcha-v3":
      return config.minValidScore !== undefined ? `min score: ${config.minValidScore}` : "";
    case "play-integrity":
      return [
        config.deviceIntegrity?.minDeviceRecognitionLevel
          ? `min device: ${config.deviceIntegrity.minDeviceRecognitionLevel}`
          : "",
        config.accountDetails?.requireLicensed ? "licensed required" : "",
        config.appIntegrity?.allowUnrecognizedVersion ? "unrecognized versions allowed" : "",
      ]
        .filter(Boolean)
        .join(", ");
    default:
      return "";
  }
}

/**
 * Turns the flags into the request body and its update mask.
 *
 * Only the fields the user actually passed go into the mask, so setting one
 * thing never resets another. Throws when a provider needs a pair of flags and
 * only one of them is there.
 */
export function buildProviderUpdate(
  provider: ProviderType,
  options: ProviderFlags,
): { update: ProviderConfig; updateMask: string[] } {
  const update: ProviderConfig = {};
  const updateMask: string[] = [];

  if (options.tokenTtl) {
    update.tokenTtl = parseTokenTtl(options.tokenTtl);
    updateMask.push("tokenTtl");
  }

  switch (provider) {
    case "device-check": {
      // The key id names the key and the private key is its contents; one
      // without the other is not a usable configuration.
      if (Boolean(options.keyId) !== Boolean(options.privateKey)) {
        throw new FirebaseError(`device-check needs both --key-id and --private-key.`);
      }
      if (options.keyId && options.privateKey) {
        update.keyId = options.keyId;
        update.privateKey = resolveSecretFlag(options.privateKey);
        updateMask.push("keyId", "privateKey");
      }
      break;
    }
    case "recaptcha-enterprise": {
      if (options.siteKey) {
        update.siteKey = options.siteKey;
        updateMask.push("siteKey");
      }
      if (options.minScore) {
        update.riskAnalysis = { minValidScore: parseMinScore(options.minScore) };
        updateMask.push("riskAnalysis.minValidScore");
      }
      break;
    }
    case "recaptcha-v3": {
      if (options.siteSecret) {
        update.siteSecret = resolveSecretFlag(options.siteSecret);
        updateMask.push("siteSecret");
      }
      if (options.minScore) {
        update.minValidScore = parseMinScore(options.minScore);
        updateMask.push("minValidScore");
      }
      break;
    }
    case "play-integrity": {
      if (options.minDeviceIntegrity) {
        update.deviceIntegrity = {
          minDeviceRecognitionLevel: parseDeviceIntegrityLevel(options.minDeviceIntegrity),
        };
        updateMask.push("deviceIntegrity.minDeviceRecognitionLevel");
      }
      if (options.requireLicensed !== undefined) {
        update.accountDetails = { requireLicensed: options.requireLicensed };
        updateMask.push("accountDetails.requireLicensed");
      }
      if (options.allowUnrecognizedVersion !== undefined) {
        update.appIntegrity = { allowUnrecognizedVersion: options.allowUnrecognizedVersion };
        updateMask.push("appIntegrity.allowUnrecognizedVersion");
      }
      break;
    }
    case "app-attest":
      // App Attest has nothing to configure except the token lifetime.
      break;
  }

  if (updateMask.length === 0) {
    throw new FirebaseError(
      `Nothing to set for ${provider}. Pass at least one setting, for example --token-ttl 1h.`,
    );
  }
  return { update, updateMask };
}
