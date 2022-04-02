import * as backend from "../backend";
import * as identityPlatform from "../../../gcp/identityPlatform";
import * as events from "../../../functions/events";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";

/**
 * Ensure that at most one blocking function of that type exists and merges identity platform options on the backend.
 * @param endpoint the Auth Blocking endpoint
 * @param wantEndpoints all of the endpoints
 */
export function ensureAuthBlockingTriggerIsValid(
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
    endpoint.blockingTrigger.accessToken || false;
  wantBackend.resourceOptions.identityPlatform.idToken ||=
    endpoint.blockingTrigger.idToken || false;
  wantBackend.resourceOptions.identityPlatform.refreshToken ||=
    endpoint.blockingTrigger.refreshToken || false;
}

export function copyIdentityPlatformOptionsToEndpoint(
  endpoint: backend.Endpoint & backend.BlockingTriggered,
  wantBackend: backend.Backend
): void {
  endpoint.blockingTrigger.accessToken =
    wantBackend.resourceOptions.identityPlatform?.accessToken || false;
  endpoint.blockingTrigger.idToken = wantBackend.resourceOptions.identityPlatform?.idToken || false;
  endpoint.blockingTrigger.refreshToken =
    wantBackend.resourceOptions.identityPlatform?.refreshToken || false;
}

/**
 * Registers the
 * @param endpoint
 */
export async function registerAuthBlockingTriggerToIdentityPlatform(
  endpoint: backend.Endpoint & backend.BlockingTriggered,
  update: boolean
): Promise<void> {
  // we need to get the config, then save the blocking function object
  // then update the triggers (beforeCreate or beforeUpdate)
  const blockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);

  if (
    endpoint.blockingTrigger.eventType === events.v1.BEFORE_CREATE_EVENT ||
    endpoint.blockingTrigger.eventType === events.v2.BEFORE_CREATE_EVENT
  ) {
    blockingConfig.triggers = {
      beforeCreate: {
        functionUri: endpoint.uri!,
      },
      beforeSignIn: blockingConfig.triggers?.beforeSignIn,
    };
  } else if (
    endpoint.blockingTrigger.eventType === events.v1.BEFORE_SIGNIN_EVENT ||
    endpoint.blockingTrigger.eventType === events.v2.BEFORE_SIGNIN_EVENT
  ) {
    blockingConfig.triggers = {
      beforeCreate: blockingConfig.triggers?.beforeCreate,
      beforeSignIn: {
        functionUri: endpoint.uri!,
      },
    };
  } else {
    throw new FirebaseError("Invalid auth blocking trigger type.");
  }

  if (!update) {
    blockingConfig.forwardInboundCredentials = {
      idToken: (endpoint.blockingTrigger.idToken || false).toString(),
      accessToken: (endpoint.blockingTrigger.accessToken || false).toString(),
      refreshToken: (endpoint.blockingTrigger.refreshToken || false).toString(),
    };
  }

  await identityPlatform.setBlockingFunctionsConfig(endpoint.project, blockingConfig);
}

export async function unregisterAuthBlockingTriggerFromIdentityPlatform(
  endpoint: backend.Endpoint & backend.BlockingTriggered
): Promise<void> {
  const blockingConfig = await identityPlatform.getBlockingFunctionsConfig(endpoint.project);
  if (
    endpoint.blockingTrigger.eventType === events.v1.BEFORE_CREATE_EVENT ||
    endpoint.blockingTrigger.eventType === events.v2.BEFORE_CREATE_EVENT
  ) {
    blockingConfig.triggers = {
      beforeCreate: {},
      beforeSignIn: blockingConfig.triggers?.beforeSignIn,
    };
  } else if (
    endpoint.blockingTrigger.eventType === events.v1.BEFORE_SIGNIN_EVENT ||
    endpoint.blockingTrigger.eventType === events.v2.BEFORE_SIGNIN_EVENT
  ) {
    blockingConfig.triggers = {
      beforeCreate: blockingConfig.triggers?.beforeCreate,
      beforeSignIn: {},
    };
  } else {
    throw new FirebaseError("Invalid auth blocking trigger type");
  }
  await identityPlatform.setBlockingFunctionsConfig(endpoint.project, blockingConfig);
}
