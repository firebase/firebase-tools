import * as backend from "../backend";
import { FirebaseError } from "../../../error";
import { Name, Service } from "./index";
import * as ailogicApi from "../../../gcp/ailogic";

export const AI_LOGIC_BEFORE_GENERATE_CONTENT =
  "firebase.vertexai.v1beta.beforeGenerateContent" as const;
export const AI_LOGIC_AFTER_GENERATE_CONTENT =
  "firebase.vertexai.v1beta.afterGenerateContent" as const;

export const AI_LOGIC_EVENTS = [
  AI_LOGIC_BEFORE_GENERATE_CONTENT,
  AI_LOGIC_AFTER_GENERATE_CONTENT,
] as const;

export type AILogicEndpoint = backend.Endpoint & {
  blockingTrigger: {
    eventType: (typeof AI_LOGIC_EVENTS)[number];
    options?: {
      regionalWebhook?: boolean;
    };
  };
};

export function isAILogicEvent(endpoint: backend.Endpoint): endpoint is AILogicEndpoint {
  if (!backend.isBlockingTriggered(endpoint)) {
    return false;
  }
  return AI_LOGIC_EVENTS.includes(
    endpoint.blockingTrigger.eventType as (typeof AI_LOGIC_EVENTS)[number],
  );
}

export class AILogicService implements Service {
  name: Name;
  api: string;

  constructor() {
    this.name = "ailogic" as Name; // We will add "ailogic" to Name type in index.ts
    this.api = "firebasevertexai.googleapis.com";
  }

  ensureTriggerRegion: (ep: backend.Endpoint & backend.EventTriggered) => Promise<void> = () =>
    Promise.resolve();

  /**
   * Validate that there are no duplicate AI Logic triggers of the same type.
   * Regional triggers are grouped by region; Global triggers are checked globally.
   */
  validateTrigger(endpoint: backend.Endpoint, wantBackend: backend.Backend): void {
    if (!isAILogicEvent(endpoint)) {
      return;
    }
    const eventType = endpoint.blockingTrigger.eventType;

    const regionalWebhook = !!endpoint.blockingTrigger.options?.regionalWebhook;
    const conflict = backend.allEndpoints(wantBackend).some((ep) => {
      if (!isAILogicEvent(ep)) {
        return false;
      }
      if (ep.blockingTrigger.eventType !== eventType || ep.id === endpoint.id) {
        return false;
      }
      if (regionalWebhook) {
        return ep.blockingTrigger.options?.regionalWebhook && ep.region === endpoint.region;
      } else {
        return !ep.blockingTrigger.options?.regionalWebhook;
      }
    });

    if (conflict) {
      if (regionalWebhook) {
        throw new FirebaseError(
          `Can only create at most one regional AI Logic Trigger for ${eventType} in region ${endpoint.region}`,
        );
      } else {
        throw new FirebaseError(
          `Can only create at most one global AI Logic Trigger for ${eventType}`,
        );
      }
    }
  }

  async registerTrigger(ep: backend.Endpoint): Promise<void> {
    if (!isAILogicEvent(ep)) {
      return;
    }
    await ailogicApi.upsertBlockingFunction(ep);
  }

  async unregisterTrigger(ep: backend.Endpoint): Promise<void> {
    if (!isAILogicEvent(ep)) {
      return;
    }
    await ailogicApi.deleteBlockingFunction(ep);
  }
}
