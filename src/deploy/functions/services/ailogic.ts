import * as backend from "../backend";
import { FirebaseError } from "../../../error";
import { Name, Service, noOpService } from "./index";
import * as ailogicApi from "../../../gcp/ailogic";
import { isAILogicEventType } from "../../../functions/events/v2";

export class AILogicService implements Service {
  name: Name;
  api: string;

  constructor() {
    this.name = "ailogic" as Name; // We will add "ailogic" to Name type in index.ts
    this.api = "firebasevertexai.googleapis.com";
  }

  ensureTriggerRegion: (ep: backend.Endpoint & backend.EventTriggered) => Promise<void> = () => Promise.resolve();

  /**
   * Validate that there are no duplicate AI Logic triggers of the same type.
   * Regional triggers are grouped by region; Global triggers are checked globally.
   */
  validateTrigger(endpoint: backend.Endpoint, wantBackend: backend.Backend): void {
    if (!backend.isBlockingTriggered(endpoint)) {
      return;
    }
    const eventType = endpoint.blockingTrigger.eventType;
    if (!isAILogicEventType(eventType)) {
      return; // Not an AI Logic trigger
    }

    const regionalWebhook = !!endpoint.blockingTrigger.options?.regionalWebhook;
    const sameTypeEndpoints = backend
      .allEndpoints(wantBackend)
      .filter(backend.isBlockingTriggered)
      .filter((ep) => ep.blockingTrigger.eventType === eventType && ep.id !== endpoint.id) as (backend.Endpoint & backend.BlockingTriggered)[];

    if (regionalWebhook) {
      // Regional: Check if another regional trigger exists in the SAME region
      const duplicate = sameTypeEndpoints.find(
        (ep) =>
          ep.region === endpoint.region &&
          !!ep.blockingTrigger.options?.regionalWebhook
      );
      if (duplicate) {
        throw new FirebaseError(
          `Can only create at most one regional AI Logic Trigger for ${eventType} in region ${endpoint.region}`
        );
      }
    } else {
      // Global: Check if another global trigger exists anywhere
      const duplicate = sameTypeEndpoints.find(
        (ep) => !ep.blockingTrigger.options?.regionalWebhook
      );
      if (duplicate) {
        throw new FirebaseError(
          `Can only create at most one global AI Logic Trigger for ${eventType}`
        );
      }
    }
  }

  async registerTrigger(ep: backend.Endpoint): Promise<void> {
    if (!backend.isBlockingTriggered(ep)) {
      return;
    }
    await ailogicApi.upsertBlockingFunction(ep);
  }

  async unregisterTrigger(ep: backend.Endpoint): Promise<void> {
    if (!backend.isBlockingTriggered(ep)) {
      return;
    }
    await ailogicApi.deleteBlockingFunction(ep);
  }
}
