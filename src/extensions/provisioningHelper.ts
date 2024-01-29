import { marked } from "marked";

import { ExtensionSpec } from "./types";
import { firebaseStorageOrigin, firedataOrigin } from "../api";
import { Client } from "../apiv2";
import { flattenArray } from "../functional";
import { FirebaseError } from "../error";
import { getExtensionSpec, InstanceSpec } from "../deploy/extensions/planner";
import { logger } from "../logger";

/** Product for which provisioning can be (or is) deferred */
export enum DeferredProduct {
  STORAGE,
  AUTH,
}

/**
 * Checks whether products used by the extension require provisioning.
 *
 * @param spec extension spec
 */
export async function checkProductsProvisioned(
  projectId: string,
  spec: ExtensionSpec,
): Promise<void> {
  const usedProducts = getUsedProducts(spec);
  await checkProducts(projectId, usedProducts);
}

/**
 * Checks whether products used for any extension version in a deploy requires provisioning.
 *
 * @param extensionVersionRefs
 */
export async function bulkCheckProductsProvisioned(
  projectId: string,
  instanceSpecs: InstanceSpec[],
): Promise<void> {
  const usedProducts = await Promise.all(
    instanceSpecs.map(async (i) => {
      const extensionSpec = await getExtensionSpec(i);
      return getUsedProducts(extensionSpec);
    }),
  );
  await checkProducts(projectId, [...flattenArray(usedProducts)]);
}

async function checkProducts(projectId: string, usedProducts: DeferredProduct[]) {
  const needProvisioning = [] as DeferredProduct[];
  let isStorageProvisionedPromise;
  let isAuthProvisionedPromise;
  if (usedProducts.includes(DeferredProduct.STORAGE)) {
    isStorageProvisionedPromise = isStorageProvisioned(projectId);
  }
  if (usedProducts.includes(DeferredProduct.AUTH)) {
    isAuthProvisionedPromise = isAuthProvisioned(projectId);
  }
  try {
    if (isStorageProvisionedPromise && !(await isStorageProvisionedPromise)) {
      needProvisioning.push(DeferredProduct.STORAGE);
    }
    if (isAuthProvisionedPromise && !(await isAuthProvisionedPromise)) {
      needProvisioning.push(DeferredProduct.AUTH);
    }
  } catch (err: any) {
    // If a provisioning check throws, we should fail open since this is best effort.
    logger.debug(`Error while checking product provisioning, failing open: ${err}`);
  }

  if (needProvisioning.length > 0) {
    let errorMessage =
      "Some services used by this extension have not been set up on your " +
      "Firebase project. To ensure this extension works as intended, you must enable these " +
      "services by following the provided links, then retry this command\n\n";
    if (needProvisioning.includes(DeferredProduct.STORAGE)) {
      errorMessage +=
        " - Firebase Storage: store and retrieve user-generated files like images, audio, and " +
        "video without server-side code.\n";
      errorMessage += `   https://console.firebase.google.com/project/${projectId}/storage`;
      errorMessage += "\n";
    }
    if (needProvisioning.includes(DeferredProduct.AUTH)) {
      errorMessage +=
        " - Firebase Authentication: authenticate and manage users from a variety of providers " +
        "without server-side code.\n";
      errorMessage += `   https://console.firebase.google.com/project/${projectId}/authentication/users`;
    }
    throw new FirebaseError(marked(errorMessage), { exit: 2 });
  }
}

/**
 * From the spec determines which products are used by the extension and
 * returns the list.
 */
export function getUsedProducts(spec: ExtensionSpec): DeferredProduct[] {
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
  const client = new Client({ urlPrefix: firebaseStorageOrigin, apiVersion: "v1beta" });
  const resp = await client.get<{ buckets: { name: string }[] }>(`/projects/${projectId}/buckets`);
  return !!resp.body?.buckets?.find((bucket: any) => {
    const bucketResourceName = bucket.name;
    // Bucket resource name looks like: projects/PROJECT_NUMBER/buckets/BUCKET_NAME
    // and we just need the BUCKET_NAME part.
    const bucketResourceNameTokens = bucketResourceName.split("/");
    const pattern = "^" + projectId + "(.[[a-z0-9]+)*.appspot.com$";
    return new RegExp(pattern).test(bucketResourceNameTokens[bucketResourceNameTokens.length - 1]);
  });
}

async function isAuthProvisioned(projectId: string): Promise<boolean> {
  const client = new Client({ urlPrefix: firedataOrigin, apiVersion: "v1" });
  const resp = await client.get<{ activation: { service: string }[] }>(
    `/projects/${projectId}/products`,
  );
  return !!resp.body?.activation?.map((a: any) => a.service).includes("FIREBASE_AUTH");
}
