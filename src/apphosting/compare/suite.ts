import * as path from "path";
import * as fs from "fs-extra";
import * as apphosting from "../../gcp/apphosting";
import { getProjectNumber } from "../../getProjectNumber";
import { apphostingOrigin } from "../../api";
import * as secrets from "./secrets";
import * as slots from "./slots";
import * as lifecycle from "./lifecycle";
import * as discover from "./discover";
import { Crawler } from "./crawler";
import * as compare from "./compare";
import * as reporter from "./reporter";
import * as poller from "../../operation-poller";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { sleep } from "../../utils";



const apphostingPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: apphostingOrigin(),
  apiVersion: "v1beta",
  backoff: 200,
  maxBackoff: 10000,
  masterTimeout: 120000, // 2 minutes
};

import * as cp from "child_process";
import * as util from "util";

export const createdConfigs = new Set<string>();

interface Destroyable {
  destroy(): void;
}

function isDestroyable(obj: unknown): obj is Destroyable {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "destroy" in obj &&
    typeof (obj as Record<string, unknown>).destroy === "function"
  );
}

async function deployToBackend(
  projectId: string,
  location: string,
  backendId: string,
  appPath: string,
  bucketName: string, // Kept for backwards compatibility but unused
  useLocalBuild: boolean,
  runtimeVersion?: string,
): Promise<void> {
  if (runtimeVersion) {
    logger.info(`Patching runtime version for backend ${backendId} to ${runtimeVersion}...`);
    const name = `projects/${projectId}/locations/${location}/backends/${backendId}`;
    const op = await apphosting.client.patch<{ name: string; runtime: { value: string } }, apphosting.Operation>(
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

  const tempConfigName = `firebase-compare-${backendId}.json`;
  const configPath = path.join(appPath, tempConfigName);
  createdConfigs.add(configPath);

  const firebaseJson = {
    apphosting: [
      {
        source: ".",
        backendId: backendId,
        localBuild: useLocalBuild
      }
    ]
  };

  await fs.writeJson(configPath, firebaseJson, { spaces: 2 });

  try {
    logger.info(`Triggering CLI deploy for backend ${backendId} (localBuild: ${useLocalBuild})...`);
    // Run exactly the same deployment path as a customer
    const experimentPrefix = useLocalBuild ? "FIREBASE_CLI_EXPERIMENTS=apphostinglocalbuilds " : "";
    const binPath = process.argv[1] || path.resolve(__dirname, "../../../bin/firebase.js");
    
    const cmd = `${experimentPrefix}node "${binPath}" deploy --only apphosting:${backendId} --project ${projectId} --config ${tempConfigName} --non-interactive --allow-local-build-secrets`;
    
    const execAsync = util.promisify(cp.exec);
    const { stdout, stderr } = await execAsync(cmd, { cwd: appPath, maxBuffer: 1024 * 1024 * 100 });
    logger.debug(`Deploy output for ${backendId}:\n${stdout}`);
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string };
    logger.error(`Deploy for ${backendId} failed!\nSTDOUT:\n${execErr.stdout || ""}\nSTDERR:\n${execErr.stderr || ""}`);
    throw new FirebaseError(`Failed to deploy variant to ${backendId}.`, { original: err instanceof Error ? err : undefined });
  } finally {
    await fs.remove(configPath);
    createdConfigs.delete(configPath);
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
import * as cache from "./cache";
import fetch from "node-fetch";

async function recordVariant(
  testCaseName: string,
  variantId: string,
  url: string,
  appPath: string,
): Promise<cache.VariantRecording> {
  const discoveredStaticRoutes = await discover.discoverRoutes(appPath);
  const allRoutesSet = new Set<string>(discoveredStaticRoutes);

  logger.info(`Crawling Variant ${variantId} at ${url} for dynamic link discovery...`);
  const crawler = new Crawler(url);
  await crawler.crawl();
  crawler.getRoutes().forEach((r) => allRoutesSet.add(r));

  const routes: Record<string, cache.RouteResponse> = {};

  for (const route of allRoutesSet) {
    logger.debug(`Recording route ${route}...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${url}${route}`, {
        redirect: "manual" as const,
        headers: { "User-Agent": "FirebaseCompareCrawler/1.0" },
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type") || "";
      const isBinary = isBinaryContentType(contentType);

      const headers: Record<string, string> = {};
      res.headers.forEach((val, key) => { headers[key] = val; });

      let body = "";
      const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
      if (contentLength > 2 * 1024 * 1024) {
        body = `(omitted - size ${contentLength} bytes exceeds 2MB limit)`;
        if (res.body && isDestroyable(res.body)) {
          res.body.destroy();
        }
      } else {
        const buffer = await res.buffer();
        if (buffer.length > 2 * 1024 * 1024) {
          body = `(omitted - size ${buffer.length} bytes exceeds 2MB limit)`;
        } else {
          body = isBinary ? buffer.toString("base64") : buffer.toString("utf-8");
        }
      }

      routes[route] = {
        status: res.status,
        headers,
        isBinary,
        body,
      };
    } catch (err) {
      logger.warn(`Failed to record route ${route}: ${err}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    id: variantId,
    testCaseName,
    timestamp: new Date().toISOString(),
    url,
    routes,
  };
}

function isBinaryContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return [
    "image/",
    "application/pdf",
    "application/zip",
    "application/octet-stream",
  ].some((type) => normalized.includes(type));
}

export async function runCompareSuite(
  projectId: string,
  location: string,
  backendIds: string[],
  slotIndex: number,
  testCaseName: string,
  variants: VariantConfig[],
  options: {
    outputDir?: string;
    recordOnly?: boolean;
    compareOnly?: boolean;
  } = {},
): Promise<void> {
  const recordings: cache.VariantRecording[] = [];

  if (!options.compareOnly) {
    // === RECORD PHASE ===
    const projectNumber = await getProjectNumber({ projectId });
    let secretsMappings: secrets.SecretMapping[][] = [];

    const cleanUp = async () => {
      logger.warn("\nInterrupted. Deleting mock secrets...");
      for (const mapping of secretsMappings) {
        await secrets.cleanupSandboxSecrets(projectId, mapping);
      }
      process.exit(1);
    };
    process.on("SIGINT", cleanUp);
    process.on("SIGTERM", cleanUp);

    try {
      // Setup secrets
      const uniquePaths = Array.from(new Set(variants.map((v) => v.path)));
      // Setup secrets sequentially to avoid concurrent creation conflicts in Secret Manager
      secretsMappings = [];
      for (const uniquePath of uniquePaths) {
        const pathBackendIds = variants
          .map((v, i) => (v.path === uniquePath ? backendIds[i] : null))
          .filter((id): id is string => id !== null);

        const mappings = await secrets.setupSandboxSecrets(
          projectId,
          location,
          uniquePath,
          slotIndex,
          pathBackendIds
        );
        secretsMappings.push(mappings);
      }

      // Deploy variants sequentially
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        await deployToBackend(
          projectId,
          location,
          backendIds[i],
          v.path,
          "", // bucketName
          !!v.localBuild,
          v.runtime,
        );
      }

      logger.info("All rollouts completed successfully!");

      logger.info("Waiting 30 seconds for Firebase Hosting routing propagation to complete...");
      await sleep(30000);

      // Retrieve URLs and Record

      const backendDataList = await Promise.all(
        backendIds.map((id) => apphosting.getBackend(projectId, location, id)),
      );
      const urls = backendDataList.map((b) => (b.uri.startsWith("http") ? b.uri : `https://${b.uri}`));

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const url = urls[i];
        const record = await recordVariant(testCaseName, v.id || String(i), url, v.path);
        await cache.saveRecording(record);
        recordings.push(record);
      }
    } finally {
      process.off("SIGINT", cleanUp);
      process.off("SIGTERM", cleanUp);
      for (const mapping of secretsMappings) {
        await secrets.cleanupSandboxSecrets(projectId, mapping);
      }
    }
  } else {
    // === LOAD RECORDINGS FROM CACHE ===
    logger.info(`Loading cached recordings for test case "${testCaseName}"...`);
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const record = await cache.loadRecording(testCaseName, v.id || String(i));
      recordings.push(record);
    }
  }

  if (options.recordOnly) {
    logger.info("Record phase complete. Skipping comparison as requested.");
    return;
  }

  // === COMPARE PHASE ===
  logger.info("Starting pairwise comparison of recorded variants...");
  for (let i = 0; i < recordings.length; i++) {
    for (let j = i + 1; j < recordings.length; j++) {
      const recA = recordings[i];
      const recB = recordings[j];
      logger.info(`\nGenerating Comparison Report: ${recA.id} vs ${recB.id}...`);

      const allRoutes = Array.from(new Set([
        ...Object.keys(recA.routes),
        ...Object.keys(recB.routes)
      ])).sort();

      const results: compare.ComparisonResult[] = [];
      for (const route of allRoutes) {
        const resA = recA.routes[route];
        const resB = recB.routes[route];

        if (!resA || !resB) {
          results.push({
            route,
            statusMatch: false,
            headerMismatches: [],
            expectedHeaderVariations: [],
            bodySimilarity: 0.0,
            bodyDiff: `Route missing on one variant: ${!resA ? recA.id : recB.id}`,
            isBinary: false
          });
          continue;
        }

        const res = await compare.compareRouteResponses(route, resA, resB);
        results.push(res);
      }

      const pairOutputDir = options.outputDir
        ? path.join(options.outputDir, `${recA.id}-vs-${recB.id}`)
        : undefined;

      await reporter.generateReport(
        projectId,
        location,
        recA.id,
        recB.id,
        results,
        pairOutputDir,
      );
    }
  }
}
