/** Returns the default compute engine service agent */
export function getDefaultServiceAccount(projectNumber: string): string {
  return `${projectNumber}-compute@developer.gserviceaccount.com`;
}
