import { FirebaseError } from "./error";

/**
 * Simple helper function that returns an error with a helpful
 * message on event of cloud resource location that is not set.
 * This was made into its own file because this error gets thrown
 * in several places: in init for Firestore, Storage, and for scheduled
 * function deployments.
 * @param location cloud resource location, like "us-central1"
 * @throws { FirebaseError } if location is not set
 */
export function ensureLocationSet(location: string, feature: string): void {
  if (!location) {
    throw new FirebaseError(
      `Cloud resource location is not set for this project but the operation ` +
        `you are attempting to perform in ${feature} requires it. ` +
        `Please see this documentation for more details: https://firebase.google.com/docs/projects/locations`,
    );
  }
}
