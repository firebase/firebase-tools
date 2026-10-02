import * as apphosting from "../../gcp/apphosting";
import * as poller from "../../operation-poller";
import { createBackend } from "../backend";
import { listFirebaseApps, createWebApp, AppPlatform } from "../../management/apps";

import { logger } from "./logger";
import { FirebaseError } from "../../error";
import { apphostingOrigin } from "../../api";

export interface ComparisonSlot {
  index: number;
  backendIds: string[];
}

const MAX_SLOTS = 10;
const apphostingPollerOptions = {
  apiOrigin: apphostingOrigin(),
  apiVersion: apphosting.API_VERSION,
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

async function updateBackendLabels(
  projectId: string,
  location: string,
  backendId: string,
  labels: Record<string, string>,
): Promise<void> {
  const name = `projects/${projectId}/locations/${location}/backends/${backendId}`;
  const res = await apphosting.client.patch<any, any>(
    name,
    { name, labels },
    { queryParams: { updateMask: "labels" } },
  );

  await poller.pollOperation({
    ...apphostingPollerOptions,
    pollerName: `update-labels-${projectId}-${location}-${backendId}`,
    operationResourceName: res.body.name,
  });
}

/**
 *
 */
export async function getOrCreateSharedWebAppId(projectId: string): Promise<string> {
  const apps = await listFirebaseApps(projectId, AppPlatform.WEB);
  if (apps.length > 0) {
    return apps[0].appId;
  }

  logger.info(
    "No existing Web Apps found. Provisioning a shared Web App for comparison slot runners...",
  );
  const createdApp = await createWebApp(projectId, { displayName: "firebase-compare-shared-app" });
  return createdApp.appId;
}

/**
 *
 */
export async function acquireComparisonSlot(
  projectId: string,
  location: string,
  numVariants: number,
): Promise<ComparisonSlot> {
  const existingBackends = await apphosting.listBackends(projectId, location);
  const backendsList = existingBackends.backends || [];

  for (let i = 1; i <= MAX_SLOTS; i++) {
    const slotBackendIds: string[] = [];
    let isLocked = false;

    for (let v = 0; v < numVariants; v++) {
      const backendId = `compare-slot-${i}-${v}`;
      slotBackendIds.push(backendId);
      const backend = backendsList.find((b) => b.name.endsWith(backendId));
      if (backend?.labels?.status === "busy") {
        isLocked = true;
      }
    }

    if (!isLocked) {
      const webAppId = await getOrCreateSharedWebAppId(projectId);

      // Check how many we need to create
      const missingCount = slotBackendIds.filter(
        (id) => !backendsList.find((b) => b.name.endsWith(id)),
      ).length;

      if (backendsList.length + missingCount > 30) {
        continue; // Quota limit hit, check next slot
      }

      logger.info(`Acquiring Comparison Slot ${i} for ${numVariants} variants...`);
      const updatePromises: Promise<void>[] = [];

      for (const backendId of slotBackendIds) {
        const backend = backendsList.find((b) => b.name.endsWith(backendId));
        if (!backend) {
          logger.info(`Provisioning backend ${backendId}...`);
          await createBackend(projectId, location, backendId, null, undefined, webAppId);
          updatePromises.push(
            updateBackendLabels(projectId, location, backendId, {
              status: "busy",
              type: "comparison-sandbox",
            }),
          );
        } else {
          updatePromises.push(
            updateBackendLabels(projectId, location, backendId, {
              ...backend.labels,
              status: "busy",
            }),
          );
        }
      }

      await Promise.all(updatePromises);
      return { index: i, backendIds: slotBackendIds };
    }
  }

  throw new FirebaseError(
    "All 10 comparison slots are currently in use or project backend limits exceeded. Please wait and try again.",
  );
}

/**
 *
 */
export async function releaseComparisonSlot(
  projectId: string,
  location: string,
  slotIndex: number,
  numVariants: number,
): Promise<void> {
  logger.info(`Releasing Comparison Slot ${slotIndex}...`);

  const existingBackends = await apphosting.listBackends(projectId, location);
  const backendsList = existingBackends.backends || [];

  const updatePromises: Promise<void>[] = [];

  for (let v = 0; v < numVariants; v++) {
    const backendId = `compare-slot-${slotIndex}-${v}`;
    const backend = backendsList.find((b) => b.name.endsWith(backendId));
    if (backend) {
      updatePromises.push(
        updateBackendLabels(projectId, location, backendId, {
          ...backend.labels,
          status: "idle",
        }),
      );
    }
  }

  await Promise.allSettled(updatePromises);
}
