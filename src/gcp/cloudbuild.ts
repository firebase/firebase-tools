/**
 * Returns the service account created by Cloud Build to use as a default in Cloud Build jobs.
 * This service account is deprecated and future users should bring their own account.
 */
export function getDefaultServiceAccount(projectNumber: string): string {
  return `${projectNumber}@cloudbuild.gserviceaccount.com`;
}
