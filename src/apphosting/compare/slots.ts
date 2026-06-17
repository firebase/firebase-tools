import * as apphosting from "../../gcp/apphosting";
import * as poller from "../../operation-poller";
import { createBackend } from "../backend";
import { listFirebaseApps, createWebApp, AppPlatform } from "../../management/apps";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { apphostingOrigin } from "../../api";

export interface ComparisonSlot {
  index: number;
  backendIdA: string;
  backendIdB: string;
}

const MAX_SLOTS = 5;
const apphostingPollerOptions = {
  apiOrigin: apphostingOrigin(),
  apiVersion: apphosting.API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

async function updateBackendAndPoll(
  projectId: string,
  location: string,
  backendId: string,
  labels: Record<string, string>
): Promise<void> {
  const op = await apphosting.updateBackend(projectId, location, backendId, { labels });
  await poller.pollOperation({
    ...apphostingPollerOptions,
    pollerName: `update-labels-${projectId}-${location}-${backendId}`,
    operationResourceName: op.name,
  });
}

export async function getOrCreateSharedWebAppId(projectId: string): Promise<string> {
  const apps = await listFirebaseApps(projectId, AppPlatform.WEB);
  if (apps.length > 0) {
    return apps[0].appId;
  }

  logger.info("No existing Web Apps found. Provisioning a shared Web App for comparison slot runners...");
  const createdApp = await createWebApp(projectId, { displayName: "firebase-compare-shared-app" });
  return createdApp.appId;
}

export async function acquireComparisonSlot(
  projectId: string,
  location: string
): Promise<ComparisonSlot> {
  const existingBackends = await apphosting.listBackends(projectId, location);
  const backendsList = existingBackends.backends || [];

  for (let i = 1; i <= MAX_SLOTS; i++) {
    const backendIdA = `compare-slot-${i}-a`;
    const backendIdB = `compare-slot-${i}-b`;

    const backendA = backendsList.find(b => b.name.endsWith(backendIdA));
    const backendB = backendsList.find(b => b.name.endsWith(backendIdB));

    const isLocked = backendA?.labels?.status === "busy" || backendB?.labels?.status === "busy";

    if (!isLocked) {
      const webAppId = await getOrCreateSharedWebAppId(projectId);

      if (!backendA || !backendB) {
        const slotsNeeded = (backendA ? 0 : 1) + (backendB ? 0 : 1);
        if (backendsList.length + slotsNeeded > 10) {
          continue; // Quota limit hit, check next slot
        }

        if (!backendA) {
          logger.info(`Provisioning backend for Comparison Slot ${i} (A)...`);
          await createBackend(projectId, location, backendIdA, null, undefined, webAppId);
          await updateBackendAndPoll(projectId, location, backendIdA, { status: "busy", type: "comparison-sandbox" });
        }
        if (!backendB) {
          logger.info(`Provisioning backend for Comparison Slot ${i} (B)...`);
          await createBackend(projectId, location, backendIdB, null, undefined, webAppId);
          await updateBackendAndPoll(projectId, location, backendIdB, { status: "busy", type: "comparison-sandbox" });
        }
      } else {
        logger.info(`Acquiring Comparison Slot ${i} (Reusing existing backends)...`);
        await Promise.all([
          updateBackendAndPoll(projectId, location, backendIdA, { ...backendA.labels, status: "busy" }),
          updateBackendAndPoll(projectId, location, backendIdB, { ...backendB.labels, status: "busy" })
        ]);
      }

      return { index: i, backendIdA, backendIdB };
    }
  }

  throw new FirebaseError(
    "All 5 comparison slots are currently in use or project backend limits exceeded. Please wait and try again."
  );
}

export async function releaseComparisonSlot(
  projectId: string,
  location: string,
  slotIndex: number
): Promise<void> {
  const backendIdA = `compare-slot-${slotIndex}-a`;
  const backendIdB = `compare-slot-${slotIndex}-b`;

  logger.info(`Releasing Comparison Slot ${slotIndex}...`);

  const existingBackends = await apphosting.listBackends(projectId, location);
  const backendsList = existingBackends.backends || [];
  const backendA = backendsList.find(b => b.name.endsWith(backendIdA));
  const backendB = backendsList.find(b => b.name.endsWith(backendIdB));

  await Promise.allSettled([
    backendA ? updateBackendAndPoll(projectId, location, backendIdA, { ...backendA.labels, status: "idle" }) : Promise.resolve(),
    backendB ? updateBackendAndPoll(projectId, location, backendIdB, { ...backendB.labels, status: "idle" }) : Promise.resolve()
  ]);
}
