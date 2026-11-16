import { logger } from "../../../logger";
import * as runv2 from "../../../gcp/runv2";
import * as artifactregistry from "../../../gcp/artifactregistry";

export interface CodebaseBuildConfig {
  projectId: string;
  region: string;
  codebase: string;
  storageSource: runv2.StorageSource;
  entryPoint?: string;
  runtime?: string;
  baseImage?: string;
  env?: Record<string, string>;
  /** Optional custom repository name in Artifact Registry (defaults to "gcf-artifacts") */
  repository?: string;
  /** Optional custom image name (defaults to codebase lowercase) */
  imageName?: string;
}

/**
 * Coordinates building codebase container images once per (codebase, region) combination.
 * When sourceToken is not an option (such as for Cloud Run functions or GCF in-place upgrades),
 * this coordinator ensures that multiple functions sharing the same source archive trigger
 * Cloud Build exactly once, sharing the resulting container image across all services.
 */
export class SingleBuildCoordinator {
  private builds = new Map<string, Promise<string>>();

  /**
   * Builds the codebase container image once per (codebase, region) combination.
   * If a build is already in progress or has completed, subsequent calls return the existing promise.
   */
  async buildCodebase(config: CodebaseBuildConfig): Promise<string> {
    const key = this.cacheKey(config.codebase, config.region);
    let buildPromise = this.builds.get(key);
    if (!buildPromise) {
      buildPromise = this.executeBuild(config).catch((err) => {
        // Clear from cache on failure so retries can re-attempt.
        this.builds.delete(key);
        throw err;
      });
      this.builds.set(key, buildPromise);
    }
    return buildPromise;
  }

  private async executeBuild(config: CodebaseBuildConfig): Promise<string> {
    const repo = config.repository || "gcf-artifacts";
    const imageName = (config.imageName || config.codebase).toLowerCase();
    const tag = `${Date.now()}`;
    const imageUri = `${config.region}-docker.pkg.dev/${config.projectId}/${repo}/${imageName}:${tag}`;

    logger.debug(
      `[SingleBuildCoordinator] Starting single Cloud Build for codebase '${config.codebase}' in region '${config.region}' -> ${imageUri}`,
    );

    await artifactregistry.ensureDockerRepository(config.projectId, config.region, repo);

    const buildpackBuild: runv2.BuildpacksBuild = {
      runtime: config.runtime,
      baseImage: config.baseImage,
      environmentVariables: {
        GOOGLE_FUNCTION_TARGET: config.entryPoint || "default",
        GOOGLE_FUNCTION_SIGNATURE_TYPE: "http",
        ...(config.env || {}),
      },
      enableAutomaticUpdates: Boolean(config.baseImage),
    };

    await runv2.submitBuild(config.projectId, config.region, {
      storageSource: config.storageSource,
      imageUri,
      buildpackBuild,
    });

    logger.debug(
      `[SingleBuildCoordinator] Successfully completed single build for codebase '${config.codebase}' in region '${config.region}' -> ${imageUri}`,
    );
    return imageUri;
  }

  private cacheKey(codebase: string, region: string): string {
    return `${codebase}:${region}`;
  }

  /**
   * Resets build cache (useful for testing or resetting between deployment runs).
   */
  reset(codebase?: string, region?: string): void {
    if (codebase && region) {
      this.builds.delete(this.cacheKey(codebase, region));
    } else {
      this.builds.clear();
    }
  }
}
