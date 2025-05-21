import { DeploymentInstanceSpec, getExtensionSpec } from "../planner";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import * as extensionsApi from "../../../extensions/extensionsApi";
import * as refs from "../../../extensions/refs";
import * as args from "../../functions/args";
import * as gcfV2 from "../../../gcp/cloudfunctionsv2";

/**
 * Handles source resolution for extension functions.
 * Instead of downloading and re-uploading sources, this leverages the fact that
 * extensions already have pre-packaged sources that can be used directly.
 */

/**
 * Gets the source information for an extension instance.
 * This extracts the source download URL from the extension version without
 * downloading the actual source.
 * 
 * @param instanceSpec The extension instance specification
 * @returns Source information that can be used with function deployment
 */
export async function getExtensionSource(
  instanceSpec: DeploymentInstanceSpec
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
    // Get the extension version to access the source download URL
    const extensionVersionRef = refs.toExtensionVersionRef(instanceSpec.ref);
    const extensionVersion = await extensionsApi.getExtensionVersion(extensionVersionRef);

    if (!extensionVersion.sourceDownloadUri) {
      throw new FirebaseError(
        `Extension version ${extensionVersionRef} does not have a source download URI`
      );
    }

    logger.debug(`Extension ${instanceSpec.instanceId} source URL: ${extensionVersion.sourceDownloadUri}`);

    // Create source configuration that uses the extension's pre-packaged source
    const source: args.Source = {
      // For GCFv1: Use the extension's source download URL directly
      sourceUrl: extensionVersion.sourceDownloadUri,
      
      // For GCFv2: Create a storage source that points to the extension source
      storage: createStorageSourceFromUrl(extensionVersion.sourceDownloadUri),
      
      // Extension sources come pre-packaged, so we can use the extension version hash
      functionsSourceV1Hash: extensionVersion.hash,
      functionsSourceV2Hash: extensionVersion.hash,
    };

    return source;

  } catch (error) {
    throw new FirebaseError(
      `Failed to get source for extension ${instanceSpec.instanceId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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
 * @returns Map of codebase ID to source configuration
 */
export async function createExtensionSources(
  instances: DeploymentInstanceSpec[]
): Promise<Record<string, args.Source>> {
  const sources: Record<string, args.Source> = {};
  
  for (const instance of instances) {
    try {
      const codebaseId = `ext-${instance.instanceId}`;
      sources[codebaseId] = await getExtensionSource(instance);
      
      logger.debug(`Created source for extension codebase ${codebaseId}`);
      
    } catch (error) {
      throw new FirebaseError(
        `Failed to create source for extension ${instance.instanceId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  return sources;
}