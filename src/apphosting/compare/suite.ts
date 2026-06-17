import * as path from "path";
import * as fs from "fs-extra";
import * as crypto from "crypto";
import * as os from "os";
import * as gcs from "../../gcp/storage";
import * as apphosting from "../../gcp/apphosting";
import * as rollout from "../rollout";
import * as deployUtil from "../../deploy/apphosting/util";
import { getProjectNumber } from "../../getProjectNumber";
import { apphostingOrigin } from "../../api";
import * as secrets from "./secrets";
import * as slots from "./slots";
import * as lifecycle from "./lifecycle";
import * as discover from "./discover";
import { Crawler } from "./crawler";
import * as compare from "./compare";
import * as reporter from "./reporter";
import { localBuild } from "../localbuilds";
import * as fsAsync from "../../fsAsync";
import * as poller from "../../operation-poller";
import { logger } from "../../logger";

const apphostingPollerOptions = {
  apiOrigin: apphostingOrigin(),
  apiVersion: "v1beta",
  backoff: 200,
  maxBackoff: 10000,
  timeout: 120000, // 2 minutes
};

async function prepareLocalBuildDir(
  rootDir: string,
  scratchDir: string,
  backendId: string,
): Promise<void> {
  const ignore = deployUtil.resolveIgnorePatterns({ backendId, rootDir: "/", ignore: [] });
  fs.rmSync(scratchDir, { recursive: true, force: true });
  fs.mkdirSync(scratchDir, { recursive: true });
  const filesToCopy = await fsAsync.readdirRecursive({
    path: rootDir,
    ignoreStrings: ignore,
    supportGitIgnore: true,
  });
  for (const file of filesToCopy) {
    const relativePath = path.relative(rootDir, file.name);
    const destPath = path.join(scratchDir, relativePath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(file.name, destPath);
  }
}

async function deployToBackend(
  projectId: string,
  location: string,
  backendId: string,
  appPath: string,
  bucketName: string,
  useLocalBuild: boolean,
  runtimeVersion?: string,
): Promise<void> {
  let archivePath: string;
  let buildInput: any;

  if (runtimeVersion) {
    logger.info(`Patching runtime version for backend ${backendId} to ${runtimeVersion}...`);
    const name = `projects/${projectId}/locations/${location}/backends/${backendId}`;
    const op = await apphosting.client.patch<any, apphosting.Operation>(
      name,
      { name, runtime: { value: runtimeVersion } },
      { queryParams: { updateMask: "runtime" } },
    );
    await poller.pollOperation<apphosting.Backend>({
      ...apphostingPollerOptions,
      pollerName: `update-runtime-${backendId}`,
      operationResourceName: op.body.name,
    });
  }

  if (useLocalBuild) {
    logger.info(`Running local build for slot backend ${backendId}...`);
    const pathHash = crypto.createHash("md5").update(appPath).digest("hex").substring(0, 8);
    const scratchDir = path.join(os.tmpdir(), `apphosting-local-build-${backendId}-${pathHash}`);

    await prepareLocalBuildDir(appPath, scratchDir, backendId);

    const { outputFiles, buildConfig } = await localBuild(
      projectId,
      scratchDir,
      {},
      { nonInteractive: true },
    );

    archivePath = await deployUtil.createLocalBuildTarArchive(
      { backendId, rootDir: "/", ignore: [] },
      scratchDir,
      outputFiles,
    );

    logger.info(`Uploading local build bundle for ${backendId}...`);
    await gcs.uploadObject(
      { file: archivePath, stream: fs.createReadStream(archivePath) },
      bucketName,
      gcs.ContentType.TAR,
    );

    const uri = `gs://${bucketName}/${path.basename(archivePath)}`;
    buildInput = {
      config: buildConfig,
      source: {
        locallyBuilt: {
          userStorageUri: uri,
          rootDirectory: "/",
          runCommand: buildConfig.runCommand,
          env: buildConfig.env,
        },
      },
    };
  } else {
    logger.info(`Packaging source archive for ${backendId}...`);
    archivePath = await deployUtil.createSourceDeployArchive(
      { backendId, rootDir: "/", ignore: [] },
      appPath,
    );

    logger.info(`Uploading source archive for ${backendId}...`);
    await gcs.uploadObject(
      { file: archivePath, stream: fs.createReadStream(archivePath) },
      bucketName,
      gcs.ContentType.ZIP,
    );

    const uri = `gs://${bucketName}/${path.basename(archivePath)}`;
    buildInput = {
      source: {
        archive: {
          userStorageUri: uri,
          rootDirectory: "/",
        },
      },
    };
  }

  logger.info(`Triggering rollout for backend ${backendId}...`);
  await rollout.orchestrateRollout({
    projectId,
    location,
    backendId,
    buildInput,
  });

  // Wait until the backend is fully done reconciling after the rollout.
  logger.info(`Waiting for backend ${backendId} to finish reconciling...`);
  let backendIsReconciling = true;
  while (backendIsReconciling) {
    const b = await apphosting.client.get<any>(
      `projects/${projectId}/locations/${location}/backends/${backendId}`,
    );
    backendIsReconciling = !!b.body.reconciling;
    if (backendIsReconciling) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export interface VariantConfig {
  id?: string;
  path: string;
  localBuild?: boolean;
  runtime?: string;
}

/**
 *
 */
export async function runCompareSuite(
  projectId: string,
  location: string,
  variants: VariantConfig[],
  options: {
    outputDir?: string;
  } = {},
): Promise<void> {
  lifecycle.validateProject(projectId);
  await lifecycle.runGarbageCollection(projectId, location);

  const projectNumber = await getProjectNumber({ projectId });

  // 1. Acquire Comparison Slot for N variants
  const slot = await slots.acquireComparisonSlot(projectId, location, variants.length);
  logger.info(
    `Acquired Comparison Slot ${slot.index} with ${variants.length} backends: ${slot.backendIds.join(", ")}`,
  );

  let secretsMappings: secrets.SecretMapping[][] = [];

  const cleanUp = async () => {
    logger.warn("\nInterrupted. Restoring slot and deleting mock secrets...");
    for (const mapping of secretsMappings) {
      await secrets.cleanupSandboxSecrets(projectId, mapping);
    }
    await slots.releaseComparisonSlot(projectId, location, slot.index, variants.length);
    process.exit(1);
  };
  process.on("SIGINT", cleanUp);
  process.on("SIGTERM", cleanUp);

  try {
    // 2. Setup mock secrets per unique codebase path
    const uniquePaths = Array.from(new Set(variants.map((v) => v.path)));
    secretsMappings = await Promise.all(
      uniquePaths.map((uniquePath) => {
        const pathBackendIds = variants
          .map((v, i) => (v.path === uniquePath ? slot.backendIds[i] : null))
          .filter((id): id is string => id !== null);

        return secrets.setupSandboxSecrets(
          projectId,
          location,
          uniquePath,
          slot.index,
          pathBackendIds
        );
      })
    );

    // 3. Package, Upload and Deploy Source for all N variants
    const bucketName = `firebaseapphosting-sources-${projectNumber}-${location.toLowerCase()}`;
    await gcs.upsertBucket({
      product: "apphosting",
      createMessage: `Ensuring bucket for comparison slot sources in ${location}...`,
      projectId,
      req: {
        baseName: bucketName,
        purposeLabel: `apphosting-source-${location.toLowerCase()}`,
        location,
        lifecycle: {
          rule: [
            {
              action: { type: "Delete" },
              condition: { age: 30 },
            },
          ],
        },
      },
    });

    await Promise.all(
      variants.map((v, i) =>
        deployToBackend(
          projectId,
          location,
          slot.backendIds[i],
          v.path,
          bucketName,
          !!v.localBuild,
          v.runtime,
        ),
      ),
    );

    logger.info("All N-Way Rollouts completed successfully!");

    // 4. Retrieve Live URLs for all variants
    const backendDataList = await Promise.all(
      slot.backendIds.map((id) => apphosting.getBackend(projectId, location, id)),
    );
    const urls = backendDataList.map((b) => (b.uri.startsWith("http") ? b.uri : `https://${b.uri}`));

    urls.forEach((url, i) => {
      logger.info(`Variant ${variants[i].id || i} URL: ${url}`);
    });

    // 5. Route Discovery & Crawling across all variants
    const allRoutesSet = new Set<string>();

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const url = urls[i];

      const discoveredStaticRoutes = await discover.discoverRoutes(v.path);
      discoveredStaticRoutes.forEach((r) => allRoutesSet.add(r));

      logger.info(`Crawling Variant ${v.id || i} for dynamic link discovery...`);
      const crawler = new Crawler(url);
      await crawler.crawl();
      const crawledRoutes = crawler.getRoutes();
      crawledRoutes.forEach((r) => allRoutesSet.add(r));
    }

    const allRoutes = Array.from(allRoutesSet).sort();
    logger.info(`Total unique routes discovered across matrix: ${allRoutes.length}`);

    // 6. Report Generation for all unique pairs (Matrix Diffing)
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        logger.info(
          `\nGenerating Comparison Report: ${variants[i].id || i} vs ${variants[j].id || j}...`,
        );

        const results: compare.ComparisonResult[] = [];
        for (const route of allRoutes) {
          const res = await compare.compareRoute(route, urls[i], urls[j]);
          results.push(res);
        }

        const pairOutputDir = options.outputDir
          ? path.join(options.outputDir, `${variants[i].id || i}-vs-${variants[j].id || j}`)
          : undefined;

        await reporter.generateReport(
          projectId,
          location,
          slot.backendIds[i],
          slot.backendIds[j],
          results,
          pairOutputDir,
        );
      }
    }
  } finally {
    process.off("SIGINT", cleanUp);
    process.off("SIGTERM", cleanUp);

    for (const mapping of secretsMappings) {
      await secrets.cleanupSandboxSecrets(projectId, mapping);
    }
    await slots.releaseComparisonSlot(projectId, location, slot.index, variants.length);
  }
}
