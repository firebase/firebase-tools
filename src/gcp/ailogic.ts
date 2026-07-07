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
import { logger } from "../logger";
import { confirm, select } from "../prompt";

export const API_VERSION = "v1beta";

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

export interface Template {
  name: string;
  templateString: string;
  displayName?: string;
  etag?: string;
  locked?: boolean;
}

export interface ListTemplatesResponse {
  templates?: Template[];
  nextPageToken?: string;
}

export type TemplateOutputOnlyFields = "name" | "etag";

export type ProviderType = "gemini-developer-api" | "agent-platform-gemini-api";

/**
 * Gets the AI Logic Config singleton.
 */
export async function getConfig(projectId: string): Promise<Config> {
  const name = `projects/${projectId}/locations/global/config`;
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
  const name = `projects/${projectId}/locations/global/config`;
  const queryParams: Record<string, string> = {};
  if (updateMask && updateMask.length > 0) {
    queryParams.updateMask = updateMask.join(",");
  }
  const res = await client.patch<Partial<Config>, Config>(name, config, { queryParams });
  return res.body;
}

/**
 * Gets a Template.
 */
export async function getTemplate(
  projectId: string,
  location: string,
  templateId: string,
): Promise<Template> {
  const name = `projects/${projectId}/locations/${location}/templates/${templateId}`;
  const res = await client.get<Template>(name);
  return res.body;
}

/**
 * Updates a Template (upsert).
 */
export async function updateTemplate(
  projectId: string,
  location: string,
  templateId: string,
  template: DeepOmit<Template, TemplateOutputOnlyFields>,
  allowMissing = true,
): Promise<Template> {
  const name = `projects/${projectId}/locations/${location}/templates/${templateId}`;
  const queryParams: Record<string, string> = {
    allowMissing: allowMissing ? "true" : "false",
  };
  const res = await client.patch<DeepOmit<Template, TemplateOutputOnlyFields>, Template>(
    name,
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
  location: string,
  templateId: string,
): Promise<void> {
  const name = `projects/${projectId}/locations/${location}/templates/${templateId}`;
  await client.delete<void>(name);
}

/**
 * Locks a Template.
 */
export async function lockTemplate(
  projectId: string,
  location: string,
  templateId: string,
): Promise<Template> {
  const name = `projects/${projectId}/locations/${location}/templates/${templateId}`;
  const template = { locked: true };
  const res = await client.patch<Partial<Template>, Template>(name, template, {
    queryParams: { updateMask: "locked" },
  });
  return res.body;
}

/**
 * Unlocks a Template.
 */
export async function unlockTemplate(
  projectId: string,
  location: string,
  templateId: string,
): Promise<Template> {
  const name = `projects/${projectId}/locations/${location}/templates/${templateId}`;
  const template = { locked: false };
  const res = await client.patch<Partial<Template>, Template>(name, template, {
    queryParams: { updateMask: "locked" },
  });
  return res.body;
}

/**
 * Lists Templates, slurping all pages.
 */
export async function listTemplates(projectId: string, location: string): Promise<Template[]> {
  const parent = `projects/${projectId}/locations/${location}`;
  let pageToken: string | undefined;
  const templates: Template[] = [];

  do {
    const queryParams: Record<string, string> = pageToken ? { pageToken } : {};
    const res = await client.get<ListTemplatesResponse>(`${parent}/templates`, { queryParams });
    if (res.body.templates) {
      templates.push(...res.body.templates);
    }
    pageToken = res.body.nextPageToken;
  } while (pageToken);

  return templates;
}

/**
 * Enables a Gemini API provider service.
 */
export async function enableProvider(projectId: string, providerType: ProviderType): Promise<void> {
  const prefix = "ailogic";
  if (providerType === "gemini-developer-api") {
    await ensureApiEnabled.ensure(projectId, "generativelanguage.googleapis.com", prefix);
    await ensureApiEnabled.ensure(projectId, "firebasevertexai.googleapis.com", prefix);
  } else if (providerType === "agent-platform-gemini-api") {
    const billingEnabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!billingEnabled) {
      throw new FirebaseError(
        `Your project ${bold(
          projectId,
        )} must be on the Blaze (pay-as-you-go) plan to enable the Agent Platform. To upgrade, visit the following URL:\n\nhttps://console.firebase.google.com/project/${projectId}/usage/details`,
      );
    }
    await ensureApiEnabled.ensure(projectId, "aiplatform.googleapis.com", prefix);
    await ensureApiEnabled.ensure(projectId, "firebasevertexai.googleapis.com", prefix);
  } else {
    throw new FirebaseError(`Invalid provider type: ${providerType as string}`);
  }
}

/**
 * Disables a Gemini API provider service.
 */
export async function disableProvider(
  projectId: string,
  providerType: ProviderType,
): Promise<void> {
  const prefix = "ailogic";
  if (providerType === "gemini-developer-api") {
    await serviceUsage.disableServiceAndPoll(
      projectId,
      "generativelanguage.googleapis.com",
      prefix,
    );
    ensureApiEnabled.uncacheEnabledAPI(projectId, "generativelanguage.googleapis.com");

    const isVertexEnabled = await ensureApiEnabled.check(
      projectId,
      "aiplatform.googleapis.com",
      prefix,
      true,
    );
    if (!isVertexEnabled) {
      await serviceUsage.disableServiceAndPoll(
        projectId,
        "firebasevertexai.googleapis.com",
        prefix,
      );
      ensureApiEnabled.uncacheEnabledAPI(projectId, "firebasevertexai.googleapis.com");
    }
  } else if (providerType === "agent-platform-gemini-api") {
    await serviceUsage.disableServiceAndPoll(projectId, "aiplatform.googleapis.com", prefix);
    ensureApiEnabled.uncacheEnabledAPI(projectId, "aiplatform.googleapis.com");

    const isDeveloperEnabled = await ensureApiEnabled.check(
      projectId,
      "generativelanguage.googleapis.com",
      prefix,
      true,
    );
    if (!isDeveloperEnabled) {
      await serviceUsage.disableServiceAndPoll(
        projectId,
        "firebasevertexai.googleapis.com",
        prefix,
      );
      ensureApiEnabled.uncacheEnabledAPI(projectId, "firebasevertexai.googleapis.com");
    }
  } else {
    throw new FirebaseError(`Invalid provider type: ${providerType as string}`);
  }
}

/**
 *
 */
export async function listProviders(projectId: string): Promise<ProviderType[]> {
  const prefix = "ailogic";
  const enabled: ProviderType[] = [];

  const isDeveloperEnabled = await ensureApiEnabled.check(
    projectId,
    "generativelanguage.googleapis.com",
    prefix,
    true,
  );
  if (isDeveloperEnabled) {
    enabled.push("gemini-developer-api");
  }

  const isVertexEnabled = await ensureApiEnabled.check(
    projectId,
    "aiplatform.googleapis.com",
    prefix,
    true,
  );
  if (isVertexEnabled) {
    let billingEnabled = false;
    try {
      billingEnabled = await cloudbilling.checkBillingEnabled(projectId);
    } catch (err: any) {
      logger.debug(`[ailogic] Failed to check billing status for project ${projectId}: ${err}`);
    }
    if (billingEnabled) {
      enabled.push("agent-platform-gemini-api");
    }
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
    "ailogic",
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
        `  firebase ailogic:providers:enable agent-platform-gemini-api\n\n` +
        `Then run this command again.`,
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

  while (true) {
    const provider = await select<ProviderType>({
      message: "Which Gemini API provider do you want to enable?",
      choices: [
        { name: "gemini-developer-api", value: "gemini-developer-api" },
        {
          name: "agent-platform-gemini-api (requires the Blaze plan)",
          value: "agent-platform-gemini-api",
        },
      ],
    });

    if (provider === "agent-platform-gemini-api") {
      const billingEnabled = await cloudbilling.checkBillingEnabled(projectId);
      if (!billingEnabled) {
        logger.info(
          `\n${bold("Error:")} The agent-platform-gemini-api provider requires the pay-as-you-go (Blaze) plan.\n` +
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
