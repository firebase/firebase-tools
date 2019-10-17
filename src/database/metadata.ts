/**
 * Package for interacting with Realtime Database metadata.
 */

 const BASE_URL = "https://metadata-dot-firebase-prod.appspot.com";
 
export interface ListRulesetItem {
  id: string
}
export async function listAllRulesets(databaseName: string): Promise<ListRulesetItem[]> {
  return [];
}