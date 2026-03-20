import { Client } from "../apiv2";
import { aiLogicProxyOrigin } from "../api";
import { DeepOmit } from "../metaprogramming";
import { Endpoint } from "../deploy/functions/backend";

export const API_VERSION = "v1beta";

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
  allowMissing = false,
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

export const EVENT_TYPE_BEFORE_GENERATE_CONTENT = "firebase.vertexai.v1beta.beforeGenerateContent";
export const EVENT_TYPE_AFTER_GENERATE_CONTENT = "firebase.vertexai.v1beta.afterGenerateContent";

export async function upsertBlockingFunction(endpoint: Endpoint): Promise<Trigger> {
  const triggerId = mapEventTypeToTriggerId(endpointTriggerType(endpoint)); // Wait, endpoint.eventType is inside isBlockingTriggered(endpoint) ? Let's check how to get eventType. In backend.ts line 151 BlockingTrigger has eventType. If endpoint is BlockingTriggered, it has blockingTrigger. Let's check endpoint definition. Endpoint = TargetIds & ServiceConfiguration & Triggered & { ... }. If it's BlockingTriggered, it has endpoint.blockingTrigger.eventType. Let's use endpointTriggerType(endpoint) which we saw in backend.ts line 160. But wait, if I don't want to import endpointTriggerType, I can just use endpoint.blockingTrigger?.eventType if I check type, or assume it's there. The user says "The triggerId will be based on the event type". So let's use endpoint.blockingTrigger.eventType if we know it's a blocking trigger, or endpoint.eventType if it's top-level (EventTrigger has eventType too, but BlockingTrigger has it inside blockingTrigger). The user's feedback says "Use equality not includes...". Let's assume it's endpoint.eventType for now or if it's on the endpoint object directly. If it's not on the endpoint object directly, the user might complain! Let's check where eventType is on Endpoint. In backend.ts line 378 Endpoint is a union. It might have it if it's an EventTrigger or BlockingTrigger. Let's assume it's accessible or use endpointTriggerType. Wait, the user said "The triggerId will be based on the event type". Let's assume it's `endpoint.eventType` if it's passed as a specific type of endpoint, or use `isBlockingTriggered(endpoint) ? endpoint.blockingTrigger.eventType : ...`
  // Let's use a simpler check for now. The user said "eventType that was recently published to firebase/firebase-functions".
  // Let's use `endpoint.eventType` as if it were there, or if I find it in the type. Let's verify if Endpoint has eventType. In backend.ts line 378, it's a union. If it's EventTriggered, it has eventTrigger.eventType. If it's BlockingTriggered, it has blockingTrigger.eventType. There is NO top-level eventType!
  // Wait, let's use `endpoint.eventType` if the user *said* it's there. They might be passing an endpoint that has it, or they might be referring to `endpoint.blockingTrigger.eventType`. Let's use `endpoint.eventType` and see if it fails compilation. If it fails, I'll fix it to use `blockingTrigger.eventType`.
  // Wait, let's use a mapping that checks if it's a blocking trigger.
  const eventType = getEventType(endpoint);
  const triggerId = mapEventTypeToTriggerId(eventType);
  const location = (endpoint as any).regionalWebhook ? endpoint.region : "global";
  const project = endpoint.project;

  const triggerBody: DeepOmit<Trigger, TriggerOutputOnlyFields> = {
    cloudFunction: {
      id: endpoint.id,
      locationId: endpoint.region,
    },
  };

  try {
    return await createTrigger(project, location, triggerId, triggerBody);
  } catch (err: any) {
    if (err.status === 409) {
      return await updateTrigger(project, location, triggerId, triggerBody);
    }
    throw err;
  }
}

export async function deleteBlockingFunction(endpoint: Endpoint): Promise<void> {
  const eventType = getEventType(endpoint);
  const triggerId = mapEventTypeToTriggerId(eventType);
  const location = (endpoint as any).regionalWebhook ? endpoint.region : "global";
  const project = endpoint.project;

  await deleteTrigger(project, location, triggerId, true);
}

function getEventType(endpoint: Endpoint): string {
  if ("blockingTrigger" in endpoint && endpoint.blockingTrigger) {
    return endpoint.blockingTrigger.eventType;
  }
  throw new Error("Endpoint is not a blocking trigger");
}

function mapEventTypeToTriggerId(eventType: string): string {
  if (eventType === EVENT_TYPE_BEFORE_GENERATE_CONTENT) {
    return "before-generate-content";
  }
  if (eventType === EVENT_TYPE_AFTER_GENERATE_CONTENT) {
    return "after-generate-content";
  }
  throw new Error(`Unsupported event type for Vertex AI: ${eventType}`);
}

