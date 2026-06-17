import { FirebaseError } from "../../error";
import * as apphosting from "../../gcp/apphosting";
import { logger } from "../../logger";
import { acquireComparisonSlot, releaseComparisonSlot } from "./slots";

const ALLOWED_PROJECTS = ["aryanf-test", "pretend-public"];

/**
 *
 */
export function validateProject(projectId: string): void {
  if (!ALLOWED_PROJECTS.includes(projectId)) {
    throw new FirebaseError(
      `Invalid project ID "${projectId}". This tool can only run on projects: ${ALLOWED_PROJECTS.join(", ")}`,
    );
  }
}

/**
 * Sweeps all slots in the project, resetting stale locks (busy for > 2 hours) to idle.
 */
export async function runGarbageCollection(projectId: string, location: string): Promise<void> {
  const existingBackends = await apphosting.listBackends(projectId, location);
  const backendsList = existingBackends.backends || [];
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;

  for (const backend of backendsList) {
    const nameParts = backend.name.split("/");
    const backendId = nameParts[nameParts.length - 1];

    if (backendId.startsWith("compare-slot-")) {
      const isBusy = backend.labels?.status === "busy";
      if (isBusy) {
        const updateTime = new Date(backend.updateTime).getTime();
        if (now - updateTime > twoHours) {
          logger.info(`Found stale lock on comparison slot backend ${backendId}. Unlocking...`);
          try {
            await apphosting.updateBackend(projectId, location, backendId, {
              labels: { ...backend.labels, status: "idle" },
            });
          } catch (err) {
            logger.debug(`Failed to unlock stale backend ${backendId}: ${err}`);
          }
        }
      }
    }
  }
}

/**
 *
 */
export async function runAutonomousComparison(
  projectId: string,
  location: string,
  localPath: string,
  options: any,
): Promise<void> {
  validateProject(projectId);
  await runGarbageCollection(projectId, location);

  const slot = await acquireComparisonSlot(projectId, location, 2);

  const cleanUpAndExit = async () => {
    logger.warn("\nProcess interrupted. Cleaning up comparison slot lock before exit...");
    await releaseComparisonSlot(projectId, location, slot.index, 2);
    process.exit(1);
  };

  process.on("SIGINT", cleanUpAndExit);
  process.on("SIGTERM", cleanUpAndExit);

  try {
    // Setup secrets, deploy, and compare...
    logger.info(
      `Using Comparison Slot ${slot.index} (Backend A: ${slot.backendIds[0]}, Backend B: ${slot.backendIds[1]})`,
    );
  } finally {
    process.off("SIGINT", cleanUpAndExit);
    process.off("SIGTERM", cleanUpAndExit);

    await releaseComparisonSlot(projectId, location, slot.index, 2);
  }
}
