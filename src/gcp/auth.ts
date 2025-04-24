import { Client } from "../apiv2";
import { identityOrigin } from "../api";

const apiClient = new Client({ urlPrefix: identityOrigin(), auth: true });

interface ProviderUserInfo {
  providerId: string,
  displayName: string,
  photoUrl: string,
  federatedId: string,
  email: string,
  rawId: string,
  screenName: string,
  phoneNumber: string
}

interface SetAccountInfoResponse {
  localId: string,
  idToken: string,
  providerUserInfo: ProviderUserInfo[],
  newEmail: string,
  refreshToken: string,
  expiresIn: string,
  emailVerified: boolean
}

/**
 * Returns the list of authorized domains.
 * @param project project identifier.
 * @return authorized domains.
 */
export async function getAuthDomains(project: string): Promise<string[]> {
  const res = await apiClient.get<{ authorizedDomains: string[] }>(
    `/admin/v2/projects/${project}/config`,
    { headers: { "x-goog-user-project": project } },
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
    {
      queryParams: { update_mask: "authorizedDomains" },
      headers: { "x-goog-user-project": project },
    },
  );
  return res.body.authorizedDomains;
}

/**
 * Disables or enabled a user from a particular project.
 * @param project project identifier.
 * @param uid the user id of the user from the firebase project.
 * @param disabled sets whether the user is marked as disabled (true) or enabled (false).
 * @returns the call succeeded (true).
 */
export async function disableUser(project:string, uid:string, disabled:boolean): Promise<boolean> {
  const res = await apiClient.post<
    { disableUser: boolean, targetProjectId: string, localId: string },
    SetAccountInfoResponse
  >(
    '/v1/accounts:update',
    {
      disableUser: disabled,
      targetProjectId: project,
      localId: uid,
    },
  );
  return (res.status == 200);
  
}
