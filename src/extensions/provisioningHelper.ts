import * as extensionsApi from "./extensionsApi";
import * as api from "../api";
import * as utils from "../utils";
import * as marked from "marked";
import { logPrefix } from "./extensionsHelper";
import { FirebaseError } from "../error";
import { logger, LogLevel } from "../logger";

const provisioningMsg =
  "Some services used by this extension have not been set up on your " +
  "Firebase project. To ensure this extension works as intended, you must enable these services " +
  "before completing installation by following the provided links.\n\n";

/** Product for which provisioning can be (or is) deferred */
export enum DeferredProduct {
  STORAGE,
  AUTH,
}

/**
 * Checks which products used by the extension require provisioning.
 *
 * @param spec extension spec
 * @returns array of products that require provisioning
 */
export async function checkProductsProvisioned(
  projectId: string,
  spec: extensionsApi.ExtensionSpec
): Promise<void> {
  const usedProducts = getUsedProducts(spec);
  const needProvisioning = [] as DeferredProduct[];
  let isStorageProvisionedPromise;
  let isAuthProvisionedPromise;
  if (usedProducts.includes(DeferredProduct.STORAGE)) {
    isStorageProvisionedPromise = isStorageProvisioned(projectId);
  }
  if (usedProducts.includes(DeferredProduct.AUTH)) {
    isAuthProvisionedPromise = isAuthProvisioned(projectId);
  }

  if (isStorageProvisionedPromise && !(await isStorageProvisionedPromise)) {
    needProvisioning.push(DeferredProduct.STORAGE);
  }
  if (isAuthProvisionedPromise && !(await isAuthProvisionedPromise)) {
    needProvisioning.push(DeferredProduct.AUTH);
  }

  if (needProvisioning.length > 0) {
    let errorMessage = provisioningMsg;
    if (needProvisioning.includes(DeferredProduct.STORAGE)) {
      errorMessage +=
        " - Firebase Storage: store and retrieve user-generated files like images, audio, and video without server-side code.\n";
      errorMessage += `   https://console.firebase.google.com/project/${projectId}/storage`;
      errorMessage += "\n\n";
    }
    if (needProvisioning.includes(DeferredProduct.AUTH)) {
      errorMessage +=
        " - Firebase Authentication: authenticate and manage users from a variety of providers without server-side code.\n";
      errorMessage += `   https://console.firebase.google.com/project/${projectId}/authentication/users`;
    }
    throw new FirebaseError(marked(errorMessage), { exit: 2 });
  }
}

/**
 * From the spec determines which products are used by the extension and
 * returns the list.
 */
export function getUsedProducts(spec: extensionsApi.ExtensionSpec): DeferredProduct[] {
  const usedProducts: DeferredProduct[] = [];
  const usedApis = spec.apis?.map((api) => api.apiName);
  const usedRoles = spec.roles?.map((r) => r.role.split(".")[0]);
  const usedTriggers = spec.resources.map((r) => getTriggerType(r.propertiesYaml));
  if (
    usedApis?.includes("storage-component.googleapis.com") ||
    usedRoles?.includes("storage") ||
    usedTriggers.find((t) => t?.startsWith("google.storage."))
  ) {
    usedProducts.push(DeferredProduct.STORAGE);
  }
  if (
    usedApis?.includes("identitytoolkit.googleapis.com") ||
    usedRoles?.includes("firebaseauth") ||
    usedTriggers.find((t) => t?.startsWith("providers/firebase.auth/"))
  ) {
    usedProducts.push(DeferredProduct.AUTH);
  }
  return usedProducts;
}

/**
 * Parses out trigger eventType from the propertiesYaml.
 */
function getTriggerType(propertiesYaml: string | undefined) {
  return propertiesYaml?.match(/eventType:\ ([\S]+)/)?.[1];
}

async function isStorageProvisioned(projectId: string): Promise<boolean> {
  const hasDefaultBucketPromise = hasDefaultBucket(projectId);
  const hasLinkedBucketPromise = hasLinkedBucket(projectId);
  return (await hasDefaultBucketPromise) && (await hasLinkedBucketPromise);
}

async function isAuthProvisioned(projectId: string): Promise<boolean> {
  const resp = await api.request("GET", `/v1/projects/${projectId}/products`, {
    auth: true,
    origin: api.firedataOrigin,
  });
  return Promise.resolve(
    !!resp.body?.activation?.map((a: any) => a.service).includes("FIREBASE_AUTH")
  );
}

async function hasDefaultBucket(projectId: string): Promise<boolean> {
  try {
    const resp = await api.request("GET", `/v1/apps/${projectId}`, {
      auth: true,
      origin: api.appengineOrigin,
    });
    return await Promise.resolve(resp.body.defaultBucket !== "undefined");
  } catch (err) {
    if (err.status === 404) {
      return Promise.resolve(false);
    }
    throw err;
  }
}

async function hasLinkedBucket(projectId: string): Promise<boolean> {
  const resp = await api.request("GET", `/v1beta/projects/${projectId}/buckets`, {
    auth: true,
    origin: api.firebaseStorageOrigin,
  });
  return await Promise.resolve(!!(resp.body?.buckets?.length > 0));
}
