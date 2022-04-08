import * as backend from "../backend";
import * as identityPlatform from "../../../gcp/identityPlatform";
import * as events from "../../../functions/events";
import { FirebaseError } from "../../../error";
import { cloneDeep } from "../../../utils";

/**
 * Ensure that at most one blocking function of that type exists and merges identity platform options on our backend to deploy.
 * @param endpoint the Auth Blocking endpoint
 * @param wantBackend the backend we are deploying
 */
export function validateBlockingTrigger(
  endpoint: backend.Endpoint & backend.BlockingTriggered,
  wantBackend: backend.Backend
): void {
  const blockingEndpoints = backend
    .allEndpoints(wantBackend)
    .filter((ep) => backend.isBlockingTriggered(ep)) as (backend.Endpoint &
    backend.BlockingTriggered)[];
  if (
    blockingEndpoints.find(
      (ep) =>
        ep.blockingTrigger.eventType === endpoint.blockingTrigger.eventType && ep.id !== endpoint.id
    )
  ) {
    throw new FirebaseError(
      `Can only create at most one Auth Blocking Trigger for ${endpoint.blockingTrigger.eventType} events`
    );
  }
}

function configChanged(
  newConfig: identityPlatform.BlockingFunctionsConfig,
  config: identityPlatform.BlockingFunctionsConfig
) {
  if (
    newConfig.triggers?.beforeCreate?.functionUri !== config.triggers?.beforeCreate?.functionUri ||
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

/**
 * Registers the auth blocking trigger to identity platform. On updates, we don't touch the options.
 * @param endpoint the blocking endpoint
 * @param update if this registration is an update
 */
export async function registerBlockingTrigger(
  endpoint: backend.Endpoint & backend.BlockingTriggered,
  update: boolean
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

  if (!update) {
    newBlockingConfig.forwardInboundCredentials = {
      idToken: endpoint.blockingTrigger.options?.idToken || false,
      accessToken: endpoint.blockingTrigger.options?.accessToken || false,
      refreshToken: endpoint.blockingTrigger.options?.refreshToken || false,
    };
  }

  if (!configChanged(newBlockingConfig, oldBlockingConfig)) {
    return;
  }

  await identityPlatform.setBlockingFunctionsConfig(endpoint.project, newBlockingConfig);
}

/**
 * Un-registers the auth blocking trigger from identity platform. If the endpoint uri is not on the resource, we do nothing.
 * @param endpoint the blocking endpoint
 */
export async function unregisterBlockingTrigger(
  endpoint: backend.Endpoint & backend.BlockingTriggered
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
