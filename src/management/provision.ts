import { Client } from "../apiv2";
import { firebaseApiOrigin } from "../api";
import { FirebaseError } from "../error";
import { pollOperation } from "../operation-poller";
import { AppPlatform } from "./apps";

interface BaseProvisionAppOptions {
  platform: AppPlatform;
}

interface IosAppOptions extends BaseProvisionAppOptions {
  platform: AppPlatform.IOS;
  bundleId: string;
  appStoreId?: string;
  teamId?: string;
}

interface AndroidAppOptions extends BaseProvisionAppOptions {
  platform: AppPlatform.ANDROID;
  packageName: string;
  sha1Hashes?: string[];
  sha256Hashes?: string[];
}

interface WebAppOptions extends BaseProvisionAppOptions {
  platform: AppPlatform.WEB;
  webAppId: string;
}

export type ProvisionAppOptions = IosAppOptions | AndroidAppOptions | WebAppOptions;

export interface ProvisionFirebaseAppResponse {
  configMimeType: string;
  configData: string;
  appResource: string;
}

interface ExistingProjectInput {
  type: "existing_project";
  projectId: string;
}

interface OrganizationInput {
  type: "organization";
  organizationId: string;
}

interface FolderInput {
  type: "folder";
  folderId: string;
}

type ProjectParentInput = ExistingProjectInput | OrganizationInput | FolderInput;

export interface ProvisionProjectOptions {
  displayName?: string;
  parent?: ProjectParentInput;
  // TODO(caot): Support specifying projectLabels and billing.
  // projectLabels?: Record<string, string>;
  // cloudBillingAccountId?: string;
}

export interface ProvisionFeatureOptions {
  location?: string;
  firebaseAiLogicInput?: Record<string, unknown>;
}

export interface ProvisionFirebaseAppOptions {
  project: ProvisionProjectOptions;
  app: ProvisionAppOptions;
  features?: ProvisionFeatureOptions;
  requestId?: string;
}

const apiClient = new Client({
  urlPrefix: firebaseApiOrigin(),
  apiVersion: "v1alpha",
});

export function buildAppNamespace(app: ProvisionAppOptions): string {
  switch (app.platform) {
    case AppPlatform.IOS:
      return app.bundleId;
    case AppPlatform.ANDROID:
      return app.packageName;
    case AppPlatform.WEB:
      return app.webAppId;
    default:
      throw new Error("Unsupported platform");
  }
}

export function buildParentString(parent: ProjectParentInput): string {
  switch (parent.type) {
    case "existing_project":
      return `projects/${parent.projectId}`;
    case "organization":
      return `organizations/${parent.organizationId}`;
    case "folder":
      return `folders/${parent.folderId}`;
    default:
      throw new Error("Unsupported parent type");
  }
}

export function buildProvisionRequest(
  options: ProvisionFirebaseAppOptions,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    appNamespace: buildAppNamespace(options.app),
    displayName: options.project.displayName,
  };

  if (options.project.parent) {
    request.parent = buildParentString(options.project.parent);
  }

  if (options.features?.location) {
    request.location = options.features.location;
  }

  if (options.requestId) {
    request.requestId = options.requestId;
  }

  // if (options.project.projectLabels) request.projectLabels = options.project.projectLabels;  // Not enabled yet
  // if (options.project.cloudBillingAccountId) request.cloudBillingAccountId = options.project.cloudBillingAccountId;  // Not enabled yet

  switch (options.app.platform) {
    case AppPlatform.IOS:
      request.appleInput = {
        appStoreId: options.app.appStoreId,
        teamId: options.app.teamId,
      };
      break;
    case AppPlatform.ANDROID:
      request.androidInput = {
        sha1Hashes: options.app.sha1Hashes,
        sha256Hashes: options.app.sha256Hashes,
      };
      break;
    case AppPlatform.WEB:
      request.webInput = {};
      break;
  }

  if (options.features?.firebaseAiLogicInput) {
    request.firebaseAiLogicInput = options.features.firebaseAiLogicInput;
  }

  return request;
}

/**
 * Provisions a new Firebase App and associated resources using the provisionFirebaseApp API.
 * @param options The provision options including project, app, and feature configurations
 * @return Promise resolving to the provisioned Firebase app response containing config data and app resource name
 */
export async function provisionFirebaseApp(
  options: ProvisionFirebaseAppOptions,
): Promise<ProvisionFirebaseAppResponse> {
  try {
    const request = buildProvisionRequest(options);

    const response = await apiClient.request<unknown, { name: string }>({
      method: "POST",
      path: "/firebase:provisionFirebaseApp",
      body: request,
    });

    const result = await pollOperation<ProvisionFirebaseAppResponse>({
      pollerName: "Provision Firebase App Poller",
      apiOrigin: firebaseApiOrigin(),
      apiVersion: "v1beta1",
      operationResourceName: response.body.name,
      masterTimeout: 300000, // 5 minutes
      backoff: 100, // Initial backoff of 100ms
      maxBackoff: 5000, // Max backoff of 5s
    });

    return result;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new FirebaseError(`Failed to provision Firebase app: ${errorMessage}`, {
      exit: 2,
      original: err instanceof Error ? err : new Error(String(err)),
    });
  }
}
