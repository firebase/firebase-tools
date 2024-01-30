import { Client } from "../apiv2";
import { identityOrigin } from "../api";

const apiClient = new Client({ urlPrefix: identityOrigin, auth: true });

/**
 * Returns the list of authorized domains.
 * @param project project identifier.
 * @return authorized domains.
 */
export async function getAuthDomains(project: string): Promise<string[]> {
  const res = await apiClient.get<{ authorizedDomains: string[] }>(
    `/admin/v2/projects/${project}/config`,
  );
  return res.body.authorizedDomains;
}

/**
 * Updates the list of authorized domains.
 * @param project project identifier.
 * @param authDomains full list of authorized domains.
 * @return authorized domains.
 */
export async function updateAuthDomains(project: string, authDomains: string[]): Promise<string[]> {
  const res = await apiClient.patch<
    { authorizedDomains: string[] },
    { authorizedDomains: string[] }
  >(
    `/admin/v2/projects/${project}/config`,
    { authorizedDomains: authDomains },
    { queryParams: { update_mask: "authorizedDomains" } },
  );
  return res.body.authorizedDomains;
}
