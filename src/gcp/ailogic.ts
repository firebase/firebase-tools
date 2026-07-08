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

export type ProviderType = "gemini-developer-api" | "agent-platform-gemini-api";

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
  // aiplatform.googleapis.com cannot be enabled without billing (the Blaze plan),
  // so an enabled Vertex API already implies the agent-platform provider is available.
  if (isVertexEnabled) {
    enabled.push("agent-platform-gemini-api");
  }

  return enabled;
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
