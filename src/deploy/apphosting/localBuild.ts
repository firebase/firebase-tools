import * as fs from "fs";
import * as path from "path";
import { localBuild } from "../../apphosting/localbuilds";
import { EnvMap } from "../../apphosting/yaml";
import { getErrMsg } from "../../error";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fsAsync from "../../fsAsync";
import { BuildConfig } from "../../gcp/apphosting";
import { logger } from "../../logger";
import { createLocalBuildTarArchive, resolveIgnorePatterns } from "./util";

/** A local build's output, packaged for upload. */
export interface PackagedLocalBuild {
  /** The built app, as a .tar.gz tmp file that's deleted when the CLI exits. */
  archive: string;
  /** The build's run command and env vars. */
  buildConfig: BuildConfig;
}

/**
 * Builds an app on this machine, for App Hosting or Cloud Run: copies the project into
 * `scratchDir`, builds the copy with Universal Maker, and tars the output. `scratchDir` is deleted
 * afterwards, even if the build fails.
 */
export async function buildLocally(
  projectId: string,
  projectDir: string,
  config: AppHostingSingle,
  env: EnvMap,
  options: { scratchDir: string; nonInteractive?: boolean; allowLocalBuildSecrets?: boolean },
): Promise<PackagedLocalBuild> {
  const { scratchDir } = options;
  try {
    await prepareLocalBuildScratchDirectory(projectDir, scratchDir, config);
    const { outputFiles, buildConfig } = await localBuild(projectId, scratchDir, env, {
      nonInteractive: options.nonInteractive,
      allowLocalBuildSecrets: options.allowLocalBuildSecrets,
      rootDir: config.rootDir,
    });
    const archive = await createLocalBuildTarArchive(config, scratchDir, outputFiles);
    return { archive, buildConfig };
  } finally {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (err: unknown) {
      // A leftover scratch folder shouldn't fail the deploy or hide the build's own error.
      logger.debug(`Failed to clean up local build directory ${scratchDir}: ${getErrMsg(err)}`);
    }
  }
}

/**
 * Prepares the scratch directory for local builds by copying non-ignored files.
 *
 * NOTE ON FILE FILTERING:
 * For local builds, we apply all ignore filtering (user firebase.json ignores and .gitignore)
 * BEFORE the build runs, right here during the directory copying phase. This creates a clean,
 * isolated scratch workspace in the `.local_build_<backendId>` folder that contains exactly the same
 * source files that would be uploaded to Cloud Build.
 */
async function prepareLocalBuildScratchDirectory(
  rootDir: string,
  localBuildScratchDir: string,
  cfg: AppHostingSingle,
): Promise<void> {
  // Resolve ignores for local builds, including default node_modules ignore
  const ignore = resolveIgnorePatterns(cfg);

  // Purge the temporary workspace if it already exists to guarantee a perfectly clean build environment,
  // eliminating stale artifacts from any previous interrupted runs.
  fs.rmSync(localBuildScratchDir, { recursive: true, force: true });
  fs.mkdirSync(localBuildScratchDir, { recursive: true });

  // Copy files respecting ignores
  const filesToCopy = await fsAsync.readdirRecursive({
    path: rootDir,
    ignoreStrings: ignore,
    supportGitIgnore: true,
  });

  for (const file of filesToCopy) {
    const relativePath = path.relative(rootDir, file.name);
    const destPath = path.join(localBuildScratchDir, relativePath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(file.name, destPath);
  }
}
