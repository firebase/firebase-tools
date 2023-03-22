import * as backend from "../backend";
import * as firestore from "../../../gcp/firestore";
import { FirebaseError } from "../../../error";

/**
 * Sets a firestore event trigger's region to the firestore database region.
 * @param endpoint the firestore endpoint
 */
export async function ensureFirestoreTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered
): Promise<void> {
  const db = await firestore.getDatabase(
    endpoint.project,
    endpoint.eventTrigger.eventFilters?.database || "(default)"
  );
  const dbRegion = db.locationId;
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = dbRegion;
  }
  if (endpoint.eventTrigger.region !== dbRegion) {
    throw new FirebaseError(
      "A firestore trigger location must match the firestore database region."
    );
  }
}
