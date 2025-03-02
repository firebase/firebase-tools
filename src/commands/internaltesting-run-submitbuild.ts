import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import * as run from "../gcp/run";
import { FirebaseError } from "../error";

/**
 * Parse a GCS URL (gs://bucket-name/path/to/object) into bucket and object components
 * @param gsUrl The Google Cloud Storage URL to parse
 * @returns Object containing bucket and object fields
 * @throws FirebaseError if the URL format is invalid
 */
function parseGcsUrl(gsUrl: string): { bucket: string; object: string } {
  const gsRegex = /^gs:\/\/([^\/]+)\/(.+)$/;
  const match = gsUrl.match(gsRegex);

  if (!match) {
    throw new FirebaseError(
      `Invalid Google Cloud Storage URL: ${gsUrl}. Expected format: gs://bucket-name/path/to/object`
    );
  }

  return {
    bucket: match[1],
    object: match[2]
  };
}

interface SubmitBuildOptions extends Options {
  source?: string;
  imageUri?: string;
  location?: string;
  functionTarget?: string;
  tags?: string;
  baseImage?: string;
}

export const command = new Command("internaltesting:run:submitbuild")
  .description("Test the Cloud Run SubmitBuild API")
  .option(
    "--source <gsUrl>",
    "Google Cloud Storage URL of the source code archive (gs://bucket-name/path/to/object)"
  )
  .option(
    "--image-uri <imageUri>",
    "Artifact Registry URI to store the built image"
  )
  .option(
    "--location <location>",
    "Location to build in (default: us-central1)",
    "us-central1"
  )
  .option(
    "--function-target <functionTarget>",
    "Name of the function target if the source is a function source"
  )
  .option(
    "--tags <tags>",
    "Comma-separated list of additional tags to annotate the build"
  )
  .option(
    "--base-image <baseImage>",
    "Base image for the buildpack build (default: google-22/run)",
    "google-22/run"
  )
  .before(requireAuth)
  .action(async (options: SubmitBuildOptions) => {
    const projectId = needProjectId(options);
    const location = options.location || "us-central1";

    if (!options.source) {
      throw new FirebaseError("--source is required (format: gs://bucket-name/path/to/object)");
    }

    if (!options.imageUri) {
      throw new FirebaseError("--image-uri is required");
    }

    // Parse the GCS URL to get bucket and object
    const { bucket, object } = parseGcsUrl(options.source);

    const functionTarget = options.functionTarget;
    const tags = options.tags ? options.tags.split(",") : [];
    const baseImage = options.baseImage || "google-22/run";

    // Create the build request parameters
    const request: Omit<run.SubmitBuildRequest, "parent"> = {
      storage_source: {
        bucket,
        object,
      },
      image_uri: options.imageUri,
      buildpack_build: {
        function_target: functionTarget,
        base_image: baseImage,
        enable_automatic_updates: true,
      },
      tags,
    };

    try {
      logger.info(`Submitting build for project ${projectId} in location ${location}...`);
      logger.info(`Source: gs://${bucket}/${object}`);
      logger.info(`Image URI: ${options.imageUri}`);
      logger.info(`Base image: ${baseImage}`);
      if (functionTarget) {
        logger.info(`Function target: ${functionTarget}`);
      }

      const response = await run.submitBuild(projectId, location, request);

      logger.info("Build submitted successfully!");
      logger.info("Response:", JSON.stringify(response, null, 2));

      return response;
    } catch (error: any) {
      logger.error("Failed to submit build:");
      
      // Just log the full raw error object for debugging
      logger.error(JSON.stringify(error, null, 2));
      
      // Now extract and display a more user-friendly message
      try {
        if (error.original && error.original.body && error.original.body.error) {
          const apiError = error.original.body.error;
          logger.error(`Error ${apiError.code}: ${apiError.message}`);
        } else if (error.message) {
          logger.error(error.message);
        }
      } catch (e) {
        // If error parsing fails, at least we already logged the raw error
      }
      
      throw error;
    }
  });
