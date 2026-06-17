import * as path from "path";
import * as fs from "fs-extra";
import * as crypto from "crypto";
import * as os from "os";
import * as gcs from "../../gcp/storage";
import * as apphosting from "../../gcp/apphosting";
import * as rollout from "../rollout";
import * as deployUtil from "../../deploy/apphosting/util";
import { getProjectNumber } from "../../getProjectNumber";
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
  apiOrigin: apphosting.apphostingOrigin(),
  apiVersion: "v1beta",
  backoff: 200,
  maxBackoff: 10000,
  timeout: 120000, // 2 minutes
};

async function prepareLocalBuildDir(rootDir: string, scratchDir: string, backendId: string): Promise<void> {
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
  runtimeVersion?: string
): Promise<void> {
  let archivePath: string;
  let buildInput: any;

  if (runtimeVersion) {
    logger.info(`Patching runtime version for backend ${backendId} to ${runtimeVersion}...`);
    const op = await apphosting.updateBackend(projectId, location, backendId, {
      runtime: { value: runtimeVersion }
    });
    await poller.pollOperation<apphosting.Backend>({
      ...apphostingPollerOptions,
      pollerName: `update-runtime-${backendId}`,
      operationResourceName: op.name,
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
      { nonInteractive: true }
    );

    archivePath = await deployUtil.createLocalBuildTarArchive(
      { backendId, rootDir: "/", ignore: [] },
      scratchDir,
      outputFiles
    );

    logger.info(`Uploading local build bundle for ${backendId}...`);
    await gcs.uploadObject(
      { file: archivePath, stream: fs.createReadStream(archivePath) },
      bucketName,
      gcs.ContentType.TAR
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
        }
      }
    };
  } else {
    logger.info(`Packaging source archive for ${backendId}...`);
    archivePath = await deployUtil.createSourceDeployArchive(
      { backendId, rootDir: "/", ignore: [] },
      appPath
    );

    logger.info(`Uploading source archive for ${backendId}...`);
    await gcs.uploadObject(
      { file: archivePath, stream: fs.createReadStream(archivePath) },
      bucketName,
      gcs.ContentType.ZIP
    );

    const uri = `gs://${bucketName}/${path.basename(archivePath)}`;
    buildInput = {
      source: {
        archive: {
          userStorageUri: uri,
          rootDirectory: "/"
        }
      }
    };
  }

  logger.info(`Triggering rollout for backend ${backendId}...`);
  await rollout.orchestrateRollout({
    projectId,
    location,
    backendId,
    buildInput
  });
}

export async function runCompareSuite(
  projectId: string,
  location: string,
  appPathA: string,
  appPathB: string,
  options: {
    outputDir?: string;
    localBuildA?: boolean;
    localBuildB?: boolean;
    runtimeA?: string;
    runtimeB?: string;
  } = {}
): Promise<void> {
  lifecycle.validateProject(projectId);
  await lifecycle.runGarbageCollection(projectId, location);

  const projectNumber = await getProjectNumber({ projectId });
  
  // 1. Acquire Comparison Slot
  const slot = await slots.acquireComparisonSlot(projectId, location);
  logger.info(`Acquired Comparison Slot ${slot.index}. Deploying A (localBuild: ${!!options.localBuildA}, runtime: ${options.runtimeA || "default"}): ${slot.backendIdA}, B (localBuild: ${!!options.localBuildB}, runtime: ${options.runtimeB || "default"}): ${slot.backendIdB}...`);

  let secretsMappings: secrets.SecretMapping[] = [];

  const cleanUp = async () => {
    logger.warn("\nInterrupted. Restoring slot and deleting mock secrets...");
    await secrets.cleanupSandboxSecrets(projectId, secretsMappings);
    await slots.releaseComparisonSlot(projectId, location, slot.index);
  };
  process.on("SIGINT", cleanUp);
  process.on("SIGTERM", cleanUp);

  try {
    // 2. Setup mock secrets
    secretsMappings = await secrets.setupSandboxSecrets(
      projectId,
      location,
      appPathA,
      slot.index,
      slot.backendIdA,
      slot.backendIdB
    );

    // 3. Package, Upload and Deploy Source A & B
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
              action: {
                type: "Delete",
              },
              condition: {
                age: 30,
              },
            },
          ],
        },
      }
    });

    await Promise.all([
      deployToBackend(projectId, location, slot.backendIdA, appPathA, bucketName, !!options.localBuildA, options.runtimeA),
      deployToBackend(projectId, location, slot.backendIdB, appPathB, bucketName, !!options.localBuildB, options.runtimeB)
    ]);

    logger.info("Rollouts completed successfully!");

    // 4. Route Discovery
    const discoveredStaticRoutes = await discover.discoverRoutes(appPathA);
    logger.info(`Discovered ${discoveredStaticRoutes.length} static routes from manifests/sitemap.`);

    // 5. Retrieve Live URLs and Run Crawler & Compare
    const [bA, bB] = await Promise.all([
      apphosting.getBackend(projectId, location, slot.backendIdA),
      apphosting.getBackend(projectId, location, slot.backendIdB)
    ]);

    const urlA = bA.uri;
    const urlB = bB.uri;

    logger.info(`Backend A URL: ${urlA}`);
    logger.info(`Backend B URL: ${urlB}`);

    logger.info("Crawling Backend A for dynamic link discovery...");
    const crawler = new Crawler(urlA);
    await crawler.crawl();
    const crawledRoutes = crawler.getRoutes();
    logger.info(`Crawler discovered ${crawledRoutes.length} routes.`);

    const allRoutes = Array.from(new Set([...discoveredStaticRoutes, ...crawledRoutes])).sort();

    logger.info(`Commencing comparison of ${allRoutes.length} routes...`);
    const results: compare.ComparisonResult[] = [];
    for (const route of allRoutes) {
      logger.info(`Comparing route: ${route}`);
      const res = await compare.compareRoute(route, urlA, urlB);
      results.push(res);
    }

    // 6. Report Generation
    await reporter.generateReport(projectId, location, slot.backendIdA, slot.backendIdB, results, options.outputDir);

  } finally {
    process.off("SIGINT", cleanUp);
    process.off("SIGTERM", cleanUp);

    await secrets.cleanupSandboxSecrets(projectId, secretsMappings);
    await slots.releaseComparisonSlot(projectId, location, slot.index);
  }
}
