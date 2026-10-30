import * as fs from "fs";
import * as path from "path";
import { localBuild } from "../../apphosting/localbuilds";
import { EnvMap } from "../../apphosting/yaml";
import { getErrMsg } from "../../error";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fsAsync from "../../fsAsync";
import { BuildConfig } from "../../gcp/apphosting";
import { logger } from "../../logger";
import {
  BuildDirectory,
  buildDirectory,
  createLocalBuildTarArchive,
  isInDirectory,
  resolveIgnorePatterns,
} from "./util";

/** A local build's output, packaged for upload. */
export interface PackagedLocalBuild {
  /** The built app, as a .tar.gz tmp file that's deleted when the CLI exits. */
  archive: string;
  /** The app's folder in the archive, with forward slashes. Empty if the app is the archive's root. */
  rootDirectory: string;
  /** The build's run command and env vars. */
  buildConfig: BuildConfig;
}

/**
 * Builds an app on this machine, for App Hosting or Cloud Run: copies the project into
 * `scratchDir`, builds the copy with Universal Maker, and tars the output. `scratchDir` is deleted
 * afterwards, even if the build fails. The archive is made from the folder the build ran in, since
 * the build's output paths and run command are relative to it.
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
    const build = await prepareLocalBuildScratchDirectory(projectDir, scratchDir, config);
    const { outputFiles, buildConfig } = await localBuild(projectId, build.dir, env, {
      nonInteractive: options.nonInteractive,
      allowLocalBuildSecrets: options.allowLocalBuildSecrets,
      rootDir: build.app,
    });
    const archive = await createLocalBuildTarArchive(config, build.dir, outputFiles);
    return { archive, rootDirectory: build.app, buildConfig };
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
 * Prepares the scratch directory for local builds by copying non-ignored files, and returns where in
 * it to build.
 *
 * The whole project is copied, like source deploys upload it. The build runs where App Hosting's
 * builds do (see buildDirectory): in the monorepo's root for an app in an Nx or Turborepo monorepo,
 * or else in the app's own folder. An app outside the project is copied on its own.
 *
 * NOTE ON FILE FILTERING:
 * For local builds, we apply all ignore filtering (user firebase.json ignores and .gitignore)
 * BEFORE the build runs, right here during the directory copying phase. This creates a clean,
 * isolated scratch workspace in the `.local_build_<backendId>` folder that contains exactly the same
 * source files that would be uploaded to Cloud Build.
 */
async function prepareLocalBuildScratchDirectory(
  projectDir: string,
  localBuildScratchDir: string,
  cfg: AppHostingSingle,
): Promise<BuildDirectory> {
  const { dir, app } = buildDirectory(projectDir, cfg.rootDir);
  // Copying the whole project, not just `dir`, keeps applying .gitignore files above `dir`.
  const copyDir = isInDirectory(dir, projectDir) ? projectDir : dir;

  // Resolve ignores for local builds, including default node_modules ignore
  const ignore = resolveIgnorePatterns(cfg);

  // Purge the temporary workspace if it already exists to guarantee a perfectly clean build environment,
  // eliminating stale artifacts from any previous interrupted runs.
  fs.rmSync(localBuildScratchDir, { recursive: true, force: true });
  fs.mkdirSync(localBuildScratchDir, { recursive: true });

  // Copy files respecting ignores
  const filesToCopy = await fsAsync.readdirRecursive({
    path: copyDir,
    ignoreStrings: ignore,
    supportGitIgnore: true,
  });

  for (const file of filesToCopy) {
    const relativePath = path.relative(copyDir, file.name);
    const destPath = path.join(localBuildScratchDir, relativePath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(file.name, destPath);
  }
  return { dir: path.join(localBuildScratchDir, path.relative(copyDir, dir)), app };
}
