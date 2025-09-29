import { Client } from "../../apiv2";
import { firebaseApiOrigin } from "../../api";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { pollOperation } from "../../operation-poller";
import { AppPlatform } from "../apps";
import * as types from "./types";

const apiClient = new Client({
  urlPrefix: firebaseApiOrigin(),
  apiVersion: "v1alpha",
});

/**
 * Builds the appropriate app namespace string based on the platform type.
 */
export function buildAppNamespace(app: types.ProvisionAppOptions): string {
  switch (app.platform) {
    case AppPlatform.IOS:
      return app.bundleId;
    case AppPlatform.ANDROID:
      return app.packageName;
    case AppPlatform.WEB:
      return app.webAppId;
    default:
      throw new FirebaseError("Unsupported platform", { exit: 2 });
  }
}

/**
 * Builds the parent resource string for Firebase project provisioning.
 */
export function buildParentString(parent: types.ProjectParentInput): string {
  switch (parent.type) {
    case "existing_project":
      return `projects/${parent.projectId}`;
    case "organization":
      return `organizations/${parent.organizationId}`;
    case "folder":
      return `folders/${parent.folderId}`;
    default:
      throw new FirebaseError("Unsupported parent type", { exit: 2 });
  }
}

/**
 * Builds the complete provision request object from the provided options.
 */
export function buildProvisionRequest(
  options: types.ProvisionFirebaseAppOptions,
): types.ProvisionRequest {
  const platformInput = (() => {
    switch (options.app.platform) {
      case AppPlatform.IOS:
        return {
          appleInput: {
            appStoreId: options.app.appStoreId,
            teamId: options.app.teamId,
          },
        };
      case AppPlatform.ANDROID:
        return {
          androidInput: {
            sha1Hashes: options.app.sha1Hashes,
            sha256Hashes: options.app.sha256Hashes,
          },
        };
      case AppPlatform.WEB:
        return { webInput: {} };
    }
  })();

  return {
    appNamespace: buildAppNamespace(options.app),
    displayName: options.project.displayName,
    ...(options.project.parent && { parent: buildParentString(options.project.parent) }),
    ...(options.features?.location && { location: options.features.location }),
    ...(options.requestId && { requestId: options.requestId }),
    ...(options.features?.firebaseAiLogicInput && {
      firebaseAiLogicInput: options.features.firebaseAiLogicInput,
    }),
    ...platformInput,
  };
}

/**
 * Provisions a new Firebase App and associated resources using the provisionFirebaseApp API.
 * @param options The provision options including project, app, and feature configurations
 * @return Promise resolving to the provisioned Firebase app response containing config data and app resource name
 */
export async function provisionFirebaseApp(
  options: types.ProvisionFirebaseAppOptions,
): Promise<types.ProvisionFirebaseAppResponse> {
  try {
    const request = buildProvisionRequest(options);

    logger.debug("[provision] Starting Firebase app provisioning...");
    logger.debug(`[provision] Request: ${JSON.stringify(request, null, 2)}`);

    const response = await apiClient.request<types.ProvisionRequest, { name: string }>({
      method: "POST",
      path: "/firebase:provisionFirebaseApp",
      body: request,
    });

    logger.debug(`[provision] Operation started: ${response.body.name}`);
    logger.debug("[provision] Polling for operation completion...");

    const result = await pollOperation<types.ProvisionFirebaseAppResponse>({
      pollerName: "Provision Firebase App Poller",
      apiOrigin: firebaseApiOrigin(),
      apiVersion: "v1beta1",
      operationResourceName: response.body.name,
      masterTimeout: 180000, // 3 minutes
      backoff: 100, // Initial backoff of 100ms
      maxBackoff: 5000, // Max backoff of 5s
    });

    logger.debug("[provision] Firebase app provisioning completed successfully");
    return result;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new FirebaseError(`Failed to provision Firebase app: ${errorMessage}`, {
      exit: 2,
      original: err instanceof Error ? err : new Error(String(err)),
    });
  }
}
