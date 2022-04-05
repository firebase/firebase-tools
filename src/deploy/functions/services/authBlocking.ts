import * as backend from "../backend";
import * as identityPlatform from "../../../gcp/identityPlatform";
import * as events from "../../../functions/events";
import { FirebaseError } from "../../../error";

const BEFORE_CREATE = events.v1.BEFORE_CREATE_EVENT || events.v2.BEFORE_CREATE_EVENT;

/**
 * Ensure that at most one blocking function of that type exists and merges identity platform options on our backend to deploy.
 * @param endpoint the Auth Blocking endpoint
 * @param wantBackend the backend we are deploying
 */
export function validateAuthBlockingTrigger(
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
  // combine the auth blocking options
  if (!wantBackend.resourceOptions.identityPlatform) {
    wantBackend.resourceOptions.identityPlatform = {
      accessToken: false,
      idToken: false,
      refreshToken: false,
    };
  }
  // we find the OR of all the resource options
  wantBackend.resourceOptions.identityPlatform.accessToken ||=
    !!endpoint.blockingTrigger.accessToken;
  wantBackend.resourceOptions.identityPlatform.idToken ||= !!endpoint.blockingTrigger.idToken;
  wantBackend.resourceOptions.identityPlatform.refreshToken ||=
    !!endpoint.blockingTrigger.refreshToken;
}

/**
 * Takes the combined options from every blocking trigger and copies them to the endpoint
 * @param endpoint the current endpoint we are processing
 * @param wantBackend the current backend we are deploying
 */
export function copyIdentityPlatformOptionsToEndpoint(
  endpoint: backend.Endpoint & backend.BlockingTriggered,
  wantBackend: backend.Backend
): void {
  endpoint.blockingTrigger.accessToken =
    !!wantBackend.resourceOptions.identityPlatform?.accessToken;
  endpoint.blockingTrigger.idToken = !!wantBackend.resourceOptions.identityPlatform?.idToken;
  endpoint.blockingTrigger.refreshToken =
    !!wantBackend.resourceOptions.identityPlatform?.refreshToken;
}

/**
 * Registers the auth blocking trigger to identity platform. On updates, we don't touch the options.
 * @param endpoint the blocking endpoint
 * @param update if this registration is an update
 */
export async function registerTrigger(
  endpoint: backend.Endpoint & backend.BlockingTriggered,
  update: boolean
): Promise<void> {
  const blockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);

  if (endpoint.blockingTrigger.eventType === BEFORE_CREATE) {
    blockingConfig.triggers = {
      ...blockingConfig.triggers,
      beforeCreate: {
        functionUri: endpoint.uri!,
      },
    };
  } else {
    blockingConfig.triggers = {
      ...blockingConfig.triggers,
      beforeSignIn: {
        functionUri: endpoint.uri!,
      },
    };
  }

  if (!update) {
    blockingConfig.forwardInboundCredentials = {
      idToken: endpoint.blockingTrigger.idToken || false,
      accessToken: endpoint.blockingTrigger.accessToken || false,
      refreshToken: endpoint.blockingTrigger.refreshToken || false,
    };
  }

  await identityPlatform.setBlockingFunctionsConfig(endpoint.project, blockingConfig);
}

/**
 * Un-registers the auth blocking trigger from identity platform. If the endpoint uri is not on the resource, we do nothing.
 * @param endpoint the blocking endpoint
 */
export async function unregisterTrigger(
  endpoint: backend.Endpoint & backend.BlockingTriggered
): Promise<void> {
  const blockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);
  if (
    endpoint.uri !== blockingConfig.triggers?.beforeCreate?.functionUri &&
    endpoint.uri !== blockingConfig.triggers?.beforeSignIn?.functionUri
  ) {
    return;
  }

  if (endpoint.blockingTrigger.eventType === BEFORE_CREATE) {
    blockingConfig.triggers = {
      ...blockingConfig.triggers,
      beforeCreate: {},
    };
  } else {
    blockingConfig.triggers = {
      ...blockingConfig.triggers,
      beforeSignIn: {},
    };
  }

  await identityPlatform.setBlockingFunctionsConfig(endpoint.project, blockingConfig);
}
