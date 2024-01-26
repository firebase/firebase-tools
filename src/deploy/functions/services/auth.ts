import * as backend from "../backend";
import * as identityPlatform from "../../../gcp/identityPlatform";
import * as events from "../../../functions/events";
import { FirebaseError } from "../../../error";
import { cloneDeep } from "../../../utils";
import { Name, noop, Service } from "./index";

export class AuthBlockingService implements Service {
  name: Name;
  api: string;
  triggerQueue: Promise<void>;

  constructor() {
    this.name = "authblocking";
    this.api = "identitytoolkit.googleapis.com";
    this.triggerQueue = Promise.resolve();
    this.ensureTriggerRegion = noop;
  }

  ensureTriggerRegion: (ep: backend.Endpoint & backend.EventTriggered) => Promise<void>;

  /**
   * Ensure that at most one blocking function of that type exists and merges identity platform options on our backend to deploy.
   * @param endpoint the Auth Blocking endpoint
   * @param wantBackend the backend we are deploying
   */
  validateTrigger(endpoint: backend.Endpoint, wantBackend: backend.Backend): void {
    if (!backend.isBlockingTriggered(endpoint)) {
      return; // this should never happen
    }
    const blockingEndpoints = backend
      .allEndpoints(wantBackend)
      .filter((ep) => backend.isBlockingTriggered(ep)) as (backend.Endpoint &
      backend.BlockingTriggered)[];
    if (
      blockingEndpoints.find(
        (ep) =>
          ep.blockingTrigger.eventType === endpoint.blockingTrigger.eventType &&
          ep.id !== endpoint.id,
      )
    ) {
      throw new FirebaseError(
        `Can only create at most one Auth Blocking Trigger for ${endpoint.blockingTrigger.eventType} events`,
      );
    }
  }

  private configChanged(
    newConfig: identityPlatform.BlockingFunctionsConfig,
    config: identityPlatform.BlockingFunctionsConfig,
  ) {
    if (
      newConfig.triggers?.beforeCreate?.functionUri !==
        config.triggers?.beforeCreate?.functionUri ||
      newConfig.triggers?.beforeSignIn?.functionUri !== config.triggers?.beforeSignIn?.functionUri
    ) {
      return true;
    }
    if (
      !!newConfig.forwardInboundCredentials?.accessToken !==
        !!config.forwardInboundCredentials?.accessToken ||
      !!newConfig.forwardInboundCredentials?.idToken !==
        !!config.forwardInboundCredentials?.idToken ||
      !!newConfig.forwardInboundCredentials?.refreshToken !==
        !!config.forwardInboundCredentials?.refreshToken
    ) {
      return true;
    }
    return false;
  }

  private async registerTriggerLocked(
    endpoint: backend.Endpoint & backend.BlockingTriggered,
  ): Promise<void> {
    const newBlockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);
    const oldBlockingConfig = cloneDeep(newBlockingConfig);

    if (endpoint.blockingTrigger.eventType === events.v1.BEFORE_CREATE_EVENT) {
      newBlockingConfig.triggers = {
        ...newBlockingConfig.triggers,
        beforeCreate: {
          functionUri: endpoint.uri!,
        },
      };
    } else {
      newBlockingConfig.triggers = {
        ...newBlockingConfig.triggers,
        beforeSignIn: {
          functionUri: endpoint.uri!,
        },
      };
    }

    newBlockingConfig.forwardInboundCredentials = {
      ...oldBlockingConfig.forwardInboundCredentials,
      ...endpoint.blockingTrigger.options,
    };

    if (!this.configChanged(newBlockingConfig, oldBlockingConfig)) {
      return;
    }

    await identityPlatform.setBlockingFunctionsConfig(endpoint.project, newBlockingConfig);
  }

  /**
   * Registers the auth blocking trigger to identity platform.
   * @param ep the blocking endpoint
   */
  registerTrigger(ep: backend.Endpoint): Promise<void> {
    if (!backend.isBlockingTriggered(ep)) {
      return Promise.resolve(); // this should never happen
    }
    this.triggerQueue = this.triggerQueue.then(() => this.registerTriggerLocked(ep));
    return this.triggerQueue;
  }

  private async unregisterTriggerLocked(
    endpoint: backend.Endpoint & backend.BlockingTriggered,
  ): Promise<void> {
    const blockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);
    if (
      endpoint.uri !== blockingConfig.triggers?.beforeCreate?.functionUri &&
      endpoint.uri !== blockingConfig.triggers?.beforeSignIn?.functionUri
    ) {
      return;
    }

    // There is a possibility that the user changed the registration on identity platform,
    // to prevent 400 errors on every create and/or sign in on the app, we will treat
    // the blockingConfig as the source of truth and only delete matching uri's.
    if (endpoint.uri === blockingConfig.triggers?.beforeCreate?.functionUri) {
      delete blockingConfig.triggers?.beforeCreate;
    }
    if (endpoint.uri === blockingConfig.triggers?.beforeSignIn?.functionUri) {
      delete blockingConfig.triggers?.beforeSignIn;
    }

    await identityPlatform.setBlockingFunctionsConfig(endpoint.project, blockingConfig);
  }

  /**
   * Un-registers the auth blocking trigger from identity platform. If the endpoint uri is not on the resource, we do nothing.
   * @param ep the blocking endpoint
   */
  unregisterTrigger(ep: backend.Endpoint): Promise<void> {
    if (!backend.isBlockingTriggered(ep)) {
      return Promise.resolve(); // this should never happen
    }
    this.triggerQueue = this.triggerQueue.then(() => this.unregisterTriggerLocked(ep));
    return this.triggerQueue;
  }
}
