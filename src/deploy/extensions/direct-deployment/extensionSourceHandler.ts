import { DeploymentInstanceSpec, getExtensionSpec } from "../planner";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import * as extensionsApi from "../../../extensions/extensionsApi";
import * as refs from "../../../extensions/refs";
import * as args from "../../functions/args";
import * as backend from "../../functions/backend";
import * as gcfV1 from "../../../gcp/cloudfunctions";
import * as gcfV2 from "../../../gcp/cloudfunctionsv2";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fetchWebSetup } from "../../../fetchWebSetup";
import { generateExtensionFunctionId } from "./naming";

/**
 * Handles source resolution for extension functions.
 * Instead of downloading and re-uploading sources, this leverages the fact that
 * extensions already have pre-packaged sources that can be used directly.
 */

/**
 * Gets the source information for an extension instance by looking at existing Cloud Functions.
 * Since Extensions API doesn't expose the archiveSourceUrl in gs:// format, we get it from 
 * the existing deployed functions which already have the correct archiveSourceUrl.
 * 
 * @param instanceSpec The extension instance specification
 * @param projectId The Firebase project ID 
 * @param existingBackend Optional existing backend to get archiveSourceUrl from
 * @returns Source configuration with proper GCS URL
 */
export async function getExtensionSource(
  instanceSpec: DeploymentInstanceSpec,
  projectId: string,
  existingBackend?: backend.Backend
): Promise<args.Source> {
  if (instanceSpec.localPath) {
    throw new FirebaseError(
      "Local extension sources are not yet supported with direct deployment"
    );
  }

  if (!instanceSpec.ref) {
    throw new FirebaseError(
      "Extension instance must have a reference to get source"
    );
  }

  logger.debug(`Getting source for extension ${instanceSpec.instanceId}`);

  try {
    // Get the extension instance to access version information
    const instance = await extensionsApi.getInstance(projectId, instanceSpec.instanceId);
    if (!instance) {
      throw new FirebaseError(`Extension instance ${instanceSpec.instanceId} not found`);
    }

    // Detect version upgrade attempts and bail out
    const currentVersion = instance.config.extensionVersion || instance.config.source?.spec?.version;
    if (instanceSpec.ref) {
      const desiredVersionRef = refs.toExtensionVersionRef(instanceSpec.ref);
      const desiredVersion = desiredVersionRef.split('@')[1];
      
      if (currentVersion && desiredVersion && currentVersion !== desiredVersion) {
        throw new FirebaseError(
          `Extension version upgrades are not supported with direct deployment. ` +
          `Extension ${instanceSpec.instanceId} is currently at version ${currentVersion} ` +
          `but you're trying to deploy version ${desiredVersion}. ` +
          `Please use the traditional extension deployment flow for version upgrades.`
        );
      }
    }

    // Get archiveSourceUrl from existing deployed functions
    let archiveSourceUrl: string | undefined;
    let sourceHash: string | undefined;
    
    if (existingBackend) {
      // Look for any existing function from this extension instance
      const existingEndpoints = backend.allEndpoints(existingBackend);
      
      console.log(`[DEBUG] Extension ${instanceSpec.instanceId}: Looking for functions with prefix ext-${instanceSpec.instanceId}-`);
      console.log(`[DEBUG] Found ${existingEndpoints.length} total existing functions:`);
      existingEndpoints.forEach(endpoint => {
        console.log(`  - ${endpoint.id}`);
      });
      
      const extensionFunction = existingEndpoints.find(endpoint => 
        endpoint.id.startsWith(`ext-${instanceSpec.instanceId}-`)
      );
      
      if (extensionFunction) {
        // Get sourceArchiveUrl from the backend endpoint (now populated from GCFv1 API)
        archiveSourceUrl = extensionFunction.sourceArchiveUrl;
        sourceHash = extensionFunction.hash;
        
        console.log(`[DEBUG] Found matching function: ${extensionFunction.id}`);
        console.log(`[DEBUG] sourceArchiveUrl: ${archiveSourceUrl}`);
        console.log(`[DEBUG] Existing function invoker config:`, {
          httpsTrigger: (extensionFunction as any).httpsTrigger,
          taskQueueTrigger: (extensionFunction as any).taskQueueTrigger
        });
        
        logger.debug(`Found existing function ${extensionFunction.id} with archiveSourceUrl: ${archiveSourceUrl}`);
      } else {
        console.log(`[DEBUG] No functions found with prefix ext-${instanceSpec.instanceId}-`);
      }
    } else {
      console.log(`[DEBUG] No existingBackend provided`);
    }

    // Direct deployment only supports updating existing functions, not creating new ones
    if (!archiveSourceUrl) {
      throw new FirebaseError(
        `Extension instance ${instanceSpec.instanceId} has no existing functions to update. ` +
        `Direct deployment only supports updating existing extension functions, not creating new ones. ` +
        `Please use the traditional extension deployment flow to create this extension first.`
      );
    }

    const source: args.Source = {
      // Use the archiveSourceUrl from existing functions
      sourceUrl: archiveSourceUrl,
      
      // For GCFv2: Create a storage source from the GCS URL
      storage: createStorageSourceFromGcsUrl(archiveSourceUrl),
      
      // Use the source hash
      functionsSourceV1Hash: sourceHash || "unknown",
      functionsSourceV2Hash: sourceHash || "unknown",
    };

    return source;

  } catch (error) {
    throw new FirebaseError(
      `Failed to get source for extension ${instanceSpec.instanceId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Converts an HTTPS Google Cloud Storage URL to gs:// format.
 * 
 * @param httpsUrl HTTPS URL like https://storage.googleapis.com/bucket/object
 * @returns GCS URL like gs://bucket/object
 */
function convertHttpsToGcsUrl(httpsUrl: string): string {
  const url = new URL(httpsUrl);
  
  if (url.hostname !== 'storage.googleapis.com') {
    throw new FirebaseError(
      `Unsupported source URL format: ${httpsUrl}. Expected Google Cloud Storage URL.`
    );
  }

  // Extract bucket and object from the path
  // Path format: /bucket-name/object-path
  const pathParts = url.pathname.split('/').filter(part => part.length > 0);
  
  if (pathParts.length < 2) {
    throw new FirebaseError(
      `Invalid source URL path: ${url.pathname}. Cannot extract bucket and object.`
    );
  }

  const bucket = pathParts[0];
  const object = pathParts.slice(1).join('/');

  return `gs://${bucket}/${object}`;
}

/**
 * Creates a StorageSource object from a GCS URL.
 * This allows GCFv2 functions to use the extension's pre-packaged source directly.
 * 
 * @param gcsUrl The GCS URL in gs://bucket/object format
 * @returns StorageSource object for GCFv2 deployment
 */
function createStorageSourceFromGcsUrl(gcsUrl: string): gcfV2.StorageSource {
  if (!gcsUrl.startsWith('gs://')) {
    throw new FirebaseError(
      `Expected GCS URL format (gs://bucket/object), got: ${gcsUrl}`
    );
  }

  // Remove gs:// prefix and split into bucket and object
  const urlWithoutPrefix = gcsUrl.substring(5); // Remove 'gs://'
  const slashIndex = urlWithoutPrefix.indexOf('/');
  
  if (slashIndex === -1) {
    throw new FirebaseError(
      `Invalid GCS URL format: ${gcsUrl}. Expected gs://bucket/object`
    );
  }

  const bucket = urlWithoutPrefix.substring(0, slashIndex);
  const object = urlWithoutPrefix.substring(slashIndex + 1);

  if (!bucket || !object) {
    throw new FirebaseError(
      `Invalid GCS URL format: ${gcsUrl}. Cannot extract bucket and object.`
    );
  }

  logger.debug(`Extension source storage: bucket=${bucket}, object=${object}`);

  return {
    bucket,
    object,
    // Extensions use a specific generation for their sources
    // Default to 0 if not specified in the URL
    generation: 0,
  };
}

/**
 * Creates a StorageSource object from an extension source download URL.
 * This allows GCFv2 functions to use the extension's pre-packaged source directly.
 * 
 * @param sourceUrl The extension's source download URL
 * @returns StorageSource object for GCFv2 deployment
 */
function createStorageSourceFromUrl(sourceUrl: string): gcfV2.StorageSource {
  // Parse the source URL to extract bucket and object information
  // Extension source URLs are typically in the format:
  // https://storage.googleapis.com/firebase-ext-eap-uploads/...
  
  const url = new URL(sourceUrl);
  
  if (url.hostname !== 'storage.googleapis.com') {
    throw new FirebaseError(
      `Unsupported source URL format: ${sourceUrl}. Expected Google Cloud Storage URL.`
    );
  }

  // Extract bucket and object from the path
  // Path format: /bucket-name/object-path
  const pathParts = url.pathname.split('/').filter(part => part.length > 0);
  
  if (pathParts.length < 2) {
    throw new FirebaseError(
      `Invalid source URL path: ${url.pathname}. Cannot extract bucket and object.`
    );
  }

  const bucket = pathParts[0];
  const object = pathParts.slice(1).join('/');

  logger.debug(`Extension source storage: bucket=${bucket}, object=${object}`);

  return {
    bucket,
    object,
    // Extensions use a specific generation for their sources
    // Default to 0 if not specified in the URL
    generation: 0,
  };
}

/**
 * Creates source configurations for multiple extension instances.
 * This is used by the Fabricator to get all necessary source information.
 * 
 * @param instances Array of extension instances
 * @param projectId The Firebase project ID
 * @param existingBackend Existing backend to get archiveSourceUrl from
 * @returns Map of codebase ID to source configuration
 */
export async function createExtensionSources(
  instances: DeploymentInstanceSpec[],
  projectId: string,
  existingBackend?: backend.Backend
): Promise<Record<string, args.Source>> {
  const sources: Record<string, args.Source> = {};
  
  for (const instance of instances) {
    try {
      const codebaseId = `ext-${instance.instanceId}`;
      sources[codebaseId] = await getExtensionSource(instance, projectId, existingBackend);
      
      logger.debug(`Created source for extension codebase ${codebaseId}`);
      
    } catch (error) {
      throw new FirebaseError(
        `Failed to create source for extension ${instance.instanceId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  return sources;
}