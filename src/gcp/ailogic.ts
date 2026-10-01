import { Client } from "../apiv2";
import { aiLogicProxyOrigin } from "../api";
import { DeepOmit } from "../metaprogramming";
import type { AILogicEndpoint } from "../deploy/functions/services/ailogic";
import { FirebaseError, getErrStatus } from "../error";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as serviceUsage from "./serviceusage";
import { bold } from "colorette";
import * as cloudbilling from "./cloudbilling";
import * as iam from "./iam";
import { logger } from "../logger";
import { confirm, select } from "../prompt";

export const API_VERSION = "v1beta";

/** Label used as the prefix for this module's user-facing progress logging. */
export const AILOGIC_LOGGING_PREFIX = "ailogic";

/**
 * All AI Logic management resources live at the fixed `global` location; there is
 * no per-region configuration surface for these commands.
 */
export const GLOBAL_LOCATION = "global";

export const AI_LOGIC_BEFORE_GENERATE_CONTENT =
  "google.firebase.ailogic.v1.beforeGenerate" as const;
export const AI_LOGIC_AFTER_GENERATE_CONTENT = "google.firebase.ailogic.v1.afterGenerate" as const;

export const AI_LOGIC_EVENTS_TO_TRIGGER = {
  [AI_LOGIC_BEFORE_GENERATE_CONTENT]: "before-generate-content",
  [AI_LOGIC_AFTER_GENERATE_CONTENT]: "after-generate-content",
} as const;

export const AI_LOGIC_TRIGGERS_TO_EVENTS = {
  "before-generate-content": AI_LOGIC_BEFORE_GENERATE_CONTENT,
  "after-generate-content": AI_LOGIC_AFTER_GENERATE_CONTENT,
} as const;

export const client = new Client({
  urlPrefix: aiLogicProxyOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

export interface FunctionTarget {
  id: string;
  locationId?: string;
}

export interface Trigger {
  name: string;
  cloudFunction?: FunctionTarget;
  etag?: string;
}

export type TriggerOutputOnlyFields = "name" | "etag";

export interface ListTriggersResponse {
  triggers?: Trigger[];
  nextPageToken?: string;
}

/**
 * Creates a new Trigger.
 */
export async function createTrigger(
  projectId: string,
  location: string,
  triggerId: string,
  trigger: DeepOmit<Trigger, TriggerOutputOnlyFields>,
  validateOnly = false,
): Promise<Trigger> {
  const parent = `projects/${projectId}/locations/${location}`;
  const res = await client.post<DeepOmit<Trigger, TriggerOutputOnlyFields>, Trigger>(
    `${parent}/triggers`,
    trigger,
    {
      queryParams: {
        triggerId,
        validateOnly: validateOnly ? "true" : "false",
      },
    },
  );
  return res.body;
}

/**
 * Gets a Trigger.
 */
export async function getTrigger(
  projectId: string,
  location: string,
  triggerId: string,
): Promise<Trigger> {
  const name = `projects/${projectId}/locations/${location}/triggers/${triggerId}`;
  const res = await client.get<Trigger>(name);
  return res.body;
}

/**
 * Updates a Trigger.
 */
export async function updateTrigger(
  projectId: string,
  location: string,
  triggerId: string,
  trigger: DeepOmit<Trigger, TriggerOutputOnlyFields>,
  updateMask?: string[],
  allowMissing = false,
  validateOnly = false,
): Promise<Trigger> {
  const name = `projects/${projectId}/locations/${location}/triggers/${triggerId}`;

  const queryParams: Record<string, string> = {
    allowMissing: allowMissing ? "true" : "false",
    validateOnly: validateOnly ? "true" : "false",
  };

  if (updateMask && updateMask.length > 0) {
    queryParams.updateMask = updateMask.join(",");
  }

  const res = await client.patch<DeepOmit<Trigger, TriggerOutputOnlyFields>, Trigger>(
    name,
    trigger,
    { queryParams },
  );
  return res.body;
}

/**
 * Deletes a Trigger.
 */
export async function deleteTrigger(
  projectId: string,
  location: string,
  triggerId: string,
  allowMissing = true,
  validateOnly = false,
  etag?: string,
): Promise<void> {
  const name = `projects/${projectId}/locations/${location}/triggers/${triggerId}`;

  const queryParams: Record<string, string> = {
    allowMissing: allowMissing ? "true" : "false",
    validateOnly: validateOnly ? "true" : "false",
  };

  if (etag) {
    queryParams.etag = etag;
  }

  await client.delete<void>(name, { queryParams });
}

/**
 * Lists Triggers, slurping all pages.
 */
export async function listTriggers(
  projectId: string,
  location: string,
  filter?: string,
): Promise<Trigger[]> {
  const parent = `projects/${projectId}/locations/${location}`;
  let pageToken: string | undefined;
  const triggers: Trigger[] = [];

  do {
    const queryParams: Record<string, string> = pageToken ? { pageToken } : {};
    if (filter) {
      queryParams.filter = filter;
    }

    // We set a page size to something reasonable or let server decide,
    // but the user wants to slurp everything.
    const res = await client.get<ListTriggersResponse>(`${parent}/triggers`, { queryParams });
    if (res.body.triggers) {
      triggers.push(...res.body.triggers);
    }
    pageToken = res.body.nextPageToken;
  } while (pageToken);

  return triggers;
}

export async function upsertBlockingFunction(endpoint: AILogicEndpoint): Promise<Trigger> {
  const eventType = endpoint.blockingTrigger.eventType;
  const triggerId = AI_LOGIC_EVENTS_TO_TRIGGER[eventType];
  const location = endpoint.blockingTrigger.options?.regionalWebhook ? endpoint.region : "global";

  const triggerBody: DeepOmit<Trigger, TriggerOutputOnlyFields> = {
    cloudFunction: {
      id: endpoint.id,
      locationId: endpoint.region,
    },
  };

  try {
    return await createTrigger(endpoint.project, location, triggerId, triggerBody);
  } catch (err: unknown) {
    if (getErrStatus(err) === 409) {
      return await updateTrigger(endpoint.project, location, triggerId, triggerBody, [
        "cloudFunction",
      ]);
    }
    throw err;
  }
}

export async function deleteBlockingFunction(endpoint: AILogicEndpoint): Promise<void> {
  const eventType = endpoint.blockingTrigger.eventType;
  const triggerId = AI_LOGIC_EVENTS_TO_TRIGGER[eventType];
  const location = endpoint.blockingTrigger.options?.regionalWebhook ? endpoint.region : "global";

  await deleteTrigger(endpoint.project, location, triggerId, true);
}

export interface GenerativeLanguageConfig {
  apiKey?: string;
}

export interface TrafficFilter {
  templateOnly?: boolean;
  firebaseAuthRequired?: boolean;
}

export interface TelemetryConfig {
  mode?: "MODE_UNSPECIFIED" | "NONE" | "ALL";
  samplingRate?: number;
}

export interface Config {
  name: string;
  generativeLanguageConfig?: GenerativeLanguageConfig;
  trafficFilter?: TrafficFilter;
  telemetryConfig?: TelemetryConfig;
}

export interface Template {
  name: string;
  templateString: string;
  displayName?: string;
  /** When set on an update or delete, the server rejects the write (409) if the template changed since the etag was read. */
  etag?: string;
  /** Output only; changed via the ModifyLock RPC (`setTemplateLocked`), not PATCH. */
  locked?: boolean;
}

interface ListTemplatesResponse {
  templates?: Template[];
  nextPageToken?: string;
}

export type TemplateOutputOnlyFields = "name" | "locked";

/** Extracts the template id (the last path segment) from a template resource name. */
export function templateIdFromName(name: string): string {
  return name.split("/").pop() ?? "";
}

// Template ids are spliced into REST resource paths, so restrict them to URL-safe
// characters: an unvalidated id like "welcome#old" or ".." would silently address a
// DIFFERENT template once the URL is parsed. (The server may impose stricter rules.)
export const TEMPLATE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Validates a template id, throwing a FirebaseError when it is not URL-safe. */
export function assertValidTemplateId(templateId: string): void {
  if (!TEMPLATE_ID_REGEX.test(templateId)) {
    throw new FirebaseError(
      `Invalid template id: ${bold(templateId)}. Template ids must start with a letter or digit and contain only letters, digits, '.', '_', and '-'.`,
    );
  }
}

// Developer-facing config paths that `ailogic:config:set` can write.
export const WRITABLE_CONFIG_PATHS = [
  "security.auth-only",
  "security.template-only",
  "monitoring.state",
  "monitoring.sample-rate-percentage",
];

/** Throws a FirebaseError listing the valid paths when `path` is not one of them. */
export function assertKnownConfigPath(path: string, validPaths: string[]): void {
  if (!validPaths.includes(path)) {
    throw new FirebaseError(
      `Unknown configuration path: ${path}\n\nValid paths:\n\n` +
        validPaths.map((p) => `  ${p}`).join("\n"),
    );
  }
}

// Templates live only at the fixed global location, so the resource name is
// derived from the project and template id alone (mirroring getConfig/updateConfig).
function templateName(projectId: string, templateId: string): string {
  return `projects/${projectId}/locations/${GLOBAL_LOCATION}/templates/${templateId}`;
}

/**
 * Runs `fn`, mapping a 404 from the API to a friendly "does not exist" error for
 * the given template. Other errors are rethrown unchanged.
 */
export async function withTemplate404<T>(templateId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      throw new FirebaseError(`Template ${bold(templateId)} does not exist.`);
    }
    throw err;
  }
}

export type ProviderType = "gemini-developer-api" | "gemini-agent-platform-api";

export const PROVIDER_TYPES: ProviderType[] = ["gemini-developer-api", "gemini-agent-platform-api"];

/** Whether the given string is a known Gemini API provider type. */
export function isProviderType(value: string): value is ProviderType {
  return PROVIDER_TYPES.some((p) => p === value);
}

/** Validates and narrows a string to a ProviderType, throwing a FirebaseError otherwise. */
export function parseProviderType(value: string): ProviderType {
  if (!isProviderType(value)) {
    throw new FirebaseError(
      `Invalid provider type: ${bold(value)}. Must be one of: ${PROVIDER_TYPES.map(
        (p) => `'${p}'`,
      ).join(", ")}.`,
    );
  }
  return value;
}

/**
 * Gets a Template.
 */
export async function getTemplate(projectId: string, templateId: string): Promise<Template> {
  const res = await client.get<Template>(templateName(projectId, templateId));
  return res.body;
}

/**
 * Updates a Template (upsert).
 */
export async function updateTemplate(
  projectId: string,
  templateId: string,
  template: DeepOmit<Template, TemplateOutputOnlyFields>,
  updateMask?: string[],
  allowMissing = true,
): Promise<Template> {
  // Without an updateMask the API replaces the whole resource, clearing any
  // writable field omitted from the body (e.g. displayName). A body etag is
  // enforced as a precondition either way; do not include "etag" in the mask.
  const queryParams: Record<string, string> = {
    allowMissing: allowMissing ? "true" : "false",
  };
  if (updateMask && updateMask.length > 0) {
    queryParams.updateMask = updateMask.join(",");
  }
  const res = await client.patch<DeepOmit<Template, TemplateOutputOnlyFields>, Template>(
    templateName(projectId, templateId),
    template,
    { queryParams },
  );
  return res.body;
}

/**
 * Deletes a Template.
 */
export async function deleteTemplate(
  projectId: string,
  templateId: string,
  etag?: string,
): Promise<void> {
  const queryParams: Record<string, string> = {};
  if (etag) {
    queryParams.etag = etag;
  }
  await client.delete<void>(templateName(projectId, templateId), { queryParams });
}

/**
 * Locks or unlocks a Template. A locked template cannot be updated or deleted
 * until it is unlocked.
 */
export async function setTemplateLocked(
  projectId: string,
  templateId: string,
  locked: boolean,
): Promise<void> {
  // `locked` is output-only on the resource; the API only changes it through the
  // dedicated ModifyLock RPC (a PATCH with updateMask=locked is rejected).
  await client.post<{ locked: boolean }, unknown>(
    `${templateName(projectId, templateId)}:modifyLock`,
    { locked },
  );
}

/**
 * Lists Templates, slurping all pages.
 */
export async function listTemplates(projectId: string): Promise<Template[]> {
  const parent = `projects/${projectId}/locations/${GLOBAL_LOCATION}`;
  let pageToken: string | undefined;
  const templates: Template[] = [];

  do {
    const queryParams: Record<string, string> = pageToken ? { pageToken } : {};
    const res = await client.get<ListTemplatesResponse>(`${parent}/templates`, { queryParams });
    if (res.body?.templates) {
      templates.push(...res.body.templates);
    }
    pageToken = res.body?.nextPageToken;
  } while (pageToken);

  return templates;
}

/**
 * Gets the AI Logic Config singleton.
 */
export async function getConfig(projectId: string): Promise<Config> {
  const name = `projects/${projectId}/locations/${GLOBAL_LOCATION}/config`;
  const res = await client.get<Config>(name);
  return res.body;
}

/**
 * Updates the AI Logic Config singleton.
 */
export async function updateConfig(
  projectId: string,
  config: Partial<Config>,
  updateMask?: string[],
): Promise<Config> {
  const name = `projects/${projectId}/locations/${GLOBAL_LOCATION}/config`;
  const queryParams: Record<string, string> = {};
  if (updateMask && updateMask.length > 0) {
    queryParams.updateMask = updateMask.join(",");
  }
  const res = await client.patch<Partial<Config>, Config>(name, config, { queryParams });
  return res.body;
}

/**
 * Enables a Gemini API provider service.
 */
export async function enableProvider(projectId: string, providerType: ProviderType): Promise<void> {
  if (providerType === "gemini-agent-platform-api") {
    const billingEnabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!billingEnabled) {
      throw new FirebaseError(
        `Your project ${bold(
          projectId,
        )} must be on the Blaze (pay-as-you-go) plan to enable the Agent Platform. To upgrade, visit the following URL:\n\nhttps://console.firebase.google.com/project/${projectId}/usage/details`,
      );
    }
  }

  // Enable the AI Logic API first: a partial failure must not leave a provider's
  // API enabled while the AI Logic API is off, a state where providers:list would
  // report the provider as enabled but AI Logic itself is not usable.
  await ensureApiEnabled.ensure(
    projectId,
    "firebasevertexai.googleapis.com",
    AILOGIC_LOGGING_PREFIX,
  );
  const providerApi =
    providerType === "gemini-developer-api"
      ? "generativelanguage.googleapis.com"
      : "aiplatform.googleapis.com";
  await ensureApiEnabled.ensure(projectId, providerApi, AILOGIC_LOGGING_PREFIX);
}

/**
 * Disables a Gemini API provider service. `disableServiceAndPoll` invalidates the
 * enablement cache for each disabled service, so no explicit uncaching is needed here.
 */
export async function disableProvider(
  projectId: string,
  providerType: ProviderType,
): Promise<void> {
  if (providerType === "gemini-developer-api") {
    await serviceUsage.disableServiceAndPoll(
      projectId,
      "generativelanguage.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
    );

    const isVertexEnabled = await ensureApiEnabled.check(
      projectId,
      "aiplatform.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
      true,
    );
    if (!isVertexEnabled) {
      await serviceUsage.disableServiceAndPoll(
        projectId,
        "firebasevertexai.googleapis.com",
        AILOGIC_LOGGING_PREFIX,
      );
    }
  } else if (providerType === "gemini-agent-platform-api") {
    await serviceUsage.disableServiceAndPoll(
      projectId,
      "aiplatform.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
    );

    const isDeveloperEnabled = await ensureApiEnabled.check(
      projectId,
      "generativelanguage.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
      true,
    );
    if (!isDeveloperEnabled) {
      await serviceUsage.disableServiceAndPoll(
        projectId,
        "firebasevertexai.googleapis.com",
        AILOGIC_LOGGING_PREFIX,
      );
    }
  }
}

/**
 * Lists which Gemini API providers are enabled, derived from underlying API enablement state.
 */
export async function listProviders(projectId: string): Promise<ProviderType[]> {
  // The three enablement checks are independent, so run them in parallel to keep
  // read commands (providers:list, config:get) responsive on a cold cache.
  const [isAILogicEnabled, isDeveloperEnabled, isVertexEnabled] = await Promise.all([
    isAILogicApiEnabled(projectId),
    ensureApiEnabled.check(
      projectId,
      "generativelanguage.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
      true,
    ),
    ensureApiEnabled.check(projectId, "aiplatform.googleapis.com", AILOGIC_LOGGING_PREFIX, true),
  ]);

  // A provider is only usable through AI Logic when the AI Logic API itself is
  // enabled. Without this check, a project with (say) generativelanguage enabled
  // outside the CLI would have its provider reported as enabled even though AI
  // Logic is off.
  if (!isAILogicEnabled) {
    return [];
  }

  const enabled: ProviderType[] = [];
  if (isDeveloperEnabled) {
    enabled.push("gemini-developer-api");
  }
  // aiplatform.googleapis.com cannot be enabled without billing (the Blaze plan),
  // so an enabled Vertex API already implies the agent-platform provider is available.
  if (isVertexEnabled) {
    enabled.push("gemini-agent-platform-api");
  }

  return enabled;
}

/**
 * Returns whether the Firebase AI Logic API is enabled on the project, without prompting to enable it.
 * Read-only commands use this to report state instead of forcing enablement.
 */
export async function isAILogicApiEnabled(projectId: string): Promise<boolean> {
  return ensureApiEnabled.check(
    projectId,
    "firebasevertexai.googleapis.com",
    AILOGIC_LOGGING_PREFIX,
    true,
  );
}

/**
 * Ensures that the Firebase AI Logic API is enabled. If not enabled:
 * - In non-interactive mode: throws an error with instructions.
 * - In interactive mode: prompts to enable, and guides the user to choose a provider to enable.
 */
export async function ensureAILogicApiEnabled(
  projectId: string,
  options: { nonInteractive?: boolean; force?: boolean },
): Promise<void> {
  if (await isAILogicApiEnabled(projectId)) {
    return;
  }

  if (options.nonInteractive) {
    throw new FirebaseError(
      `The Firebase AI Logic API (firebasevertexai.googleapis.com) is not enabled on project ${projectId}.\n\n` +
        `Enable Firebase AI Logic with one of the Gemini API providers by running:\n\n` +
        `  firebase ailogic:providers:enable gemini-developer-api\n` +
        `  firebase ailogic:providers:enable gemini-agent-platform-api\n\n` +
        `Then run this command again.`,
    );
  }

  // Verify the caller can actually enable the API before prompting, so we fail
  // with a clear permission error up front instead of midway through the flow.
  const { missing } = await iam.testIamPermissions(projectId, ["serviceusage.services.enable"]);
  if (missing.length > 0) {
    throw new FirebaseError(
      `You do not have permission to enable the Firebase AI Logic API on project ${projectId}.\n\n` +
        `Missing permission: ${missing.join(", ")}\n\n` +
        `This permission is included in the Owner and Editor roles. Ask a project ` +
        `administrator to enable the API or grant you the permission, then run this command again.`,
    );
  }

  logger.info(
    `The Firebase AI Logic API (firebasevertexai.googleapis.com) is not enabled on project ${projectId}.`,
  );
  const proceed = await confirm({
    message: "Would you like to enable it now?",
    default: true,
    force: options.force,
  });
  if (!proceed) {
    throw new FirebaseError("Command aborted.", { exit: 1 });
  }

  for (;;) {
    // "cancel" gives the Spark-plan retry loop below an exit that is not Ctrl+C.
    const provider = await select<ProviderType | "cancel">({
      message: "Which Gemini API provider do you want to enable?",
      choices: [
        { name: "gemini-developer-api", value: "gemini-developer-api" },
        {
          name: "gemini-agent-platform-api (requires the Blaze plan)",
          value: "gemini-agent-platform-api",
        },
        { name: "cancel", value: "cancel" },
      ],
    });
    if (provider === "cancel") {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }

    if (provider === "gemini-agent-platform-api") {
      const billingEnabled = await cloudbilling.checkBillingEnabled(projectId);
      if (!billingEnabled) {
        logger.info(
          `\n${bold("Error:")} The gemini-agent-platform-api provider requires the pay-as-you-go (Blaze) plan.\n` +
            `Project ${projectId} is on the Spark plan.\n\n` +
            `Upgrade your plan at:\n\n` +
            `  https://console.firebase.google.com/project/${projectId}/usage/details\n`,
        );
        continue;
      }
    }

    logger.info(`Enabling firebasevertexai.googleapis.com...`);
    logger.info(`Enabling provider ${provider}...`);
    await enableProvider(projectId, provider);
    logger.info(bold(`Successfully enabled Firebase AI Logic with provider: ${provider}`));
    break;
  }
}
