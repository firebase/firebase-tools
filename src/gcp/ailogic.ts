import { Client } from "../apiv2";
import { aiLogicProxyOrigin } from "../api";
import { DeepOmit } from "../metaprogramming";
import type { AILogicEndpoint } from "../deploy/functions/services/ailogic";
import { FirebaseError, getErrStatus } from "../error";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as serviceUsage from "./serviceusage";
import * as rules from "./rules";
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

/**
 *
 */
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

/**
 *
 */
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
  if (providerType === "gemini-developer-api") {
    await ensureApiEnabled.ensure(
      projectId,
      "generativelanguage.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
    );
    await ensureApiEnabled.ensure(
      projectId,
      "firebasevertexai.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
    );
  } else if (providerType === "gemini-agent-platform-api") {
    const billingEnabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!billingEnabled) {
      throw new FirebaseError(
        `Your project ${bold(
          projectId,
        )} must be on the Blaze (pay-as-you-go) plan to enable the Agent Platform. To upgrade, visit the following URL:\n\nhttps://console.firebase.google.com/project/${projectId}/usage/details`,
      );
    }
    await ensureApiEnabled.ensure(projectId, "aiplatform.googleapis.com", AILOGIC_LOGGING_PREFIX);
    await ensureApiEnabled.ensure(
      projectId,
      "firebasevertexai.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
    );
  }
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
  // The two enablement checks are independent, so run them in parallel to keep
  // read commands (providers:list, config:get) responsive on a cold cache.
  const [isDeveloperEnabled, isVertexEnabled] = await Promise.all([
    ensureApiEnabled.check(
      projectId,
      "generativelanguage.googleapis.com",
      AILOGIC_LOGGING_PREFIX,
      true,
    ),
    ensureApiEnabled.check(projectId, "aiplatform.googleapis.com", AILOGIC_LOGGING_PREFIX, true),
  ]);

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
 *
 */
export function generateRulesContent(authOnly: boolean, templateOnly: boolean): string {
  const condition = authOnly ? "request.auth != null" : "true";

  return `rules_version = '2';
service firebase.vertexai {
  match /projects/{project}/locations/{location} {
    match /templates/{template} {
      allow read: if ${condition};
    }
    match /models/{model} {
      allow read: if ${templateOnly ? "false" : condition};
    }
  }
}`;
}

export interface SecurityRulesConfig {
  authOnly: boolean;
  templateOnly: boolean;
}

/**
 * Gets security rules settings by fetching and parsing the active release.
 */
export async function getSecurityRules(projectId: string): Promise<SecurityRulesConfig> {
  const releases = await rules.listAllReleases(projectId);
  const rulesetName = await rules.getLatestRulesetName(projectId, "firebase.vertexai", releases);
  if (!rulesetName) {
    return { authOnly: false, templateOnly: false };
  }
  const files = await rules.getRulesetContent(rulesetName);
  const vertexFile = files.find((f) => f.name === "vertexai.rules");
  if (!vertexFile) {
    return { authOnly: false, templateOnly: false };
  }
  const content = vertexFile.content;
  const authOnly = content.includes("request.auth != null");
  const templateOnly = content.includes("allow read: if false");
  return { authOnly, templateOnly };
}

/**
 * Deploys new security rules.
 */
export async function updateSecurityRules(
  projectId: string,
  authOnly: boolean,
  templateOnly: boolean,
): Promise<void> {
  const content = generateRulesContent(authOnly, templateOnly);
  const files = [
    {
      name: "vertexai.rules",
      content,
    },
  ];
  const rulesetName = await rules.createRuleset(projectId, files);
  await rules.updateOrCreateRelease(projectId, rulesetName, "firebase.vertexai");
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
  const isEnabled = await ensureApiEnabled.check(
    projectId,
    "firebasevertexai.googleapis.com",
    AILOGIC_LOGGING_PREFIX,
    true,
  );
  if (isEnabled) {
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
  });
  if (!proceed) {
    throw new FirebaseError("Command aborted.", { exit: 1 });
  }

  for (;;) {
    const provider = await select<ProviderType>({
      message: "Which Gemini API provider do you want to enable?",
      choices: [
        { name: "gemini-developer-api", value: "gemini-developer-api" },
        {
          name: "gemini-agent-platform-api (requires the Blaze plan)",
          value: "gemini-agent-platform-api",
        },
      ],
    });

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
