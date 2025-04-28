import { Client } from "../apiv2";
import { identityOrigin } from "../api";

interface MfaEnrollment {
  mfaEnrollmentId: string;
  displayName: string;
  enrolledAt: string;
  phoneInfo?: string;
  emailInfo?: {
    emailAddress: string;
  };
  unobfuscatedPhoneInfo?: string;
}

interface UserInfo {
  localId: string;
  email: string;
  displayName: string;
  language: string;
  photoUrl: string;
  timeZone: string;
  dateOfBirth: string;
  passwordHash: string;
  salt: string;
  version: number;
  emailVerified: boolean;
  passwordUpdatedAt: number;
  providerUserInfo: {
    providerId: string;
    displayName: string;
    photoUrl: string;
    federatedId: string;
    email: string;
    rawId: string;
    screenName: string;
    phoneNumber: string;
  }[];
  validSince: string;
  disabled: boolean;
  lastLoginAt: string;
  createdAt: string;
  screenName: string;
  customAuth: boolean;
  rawPassword?: string;
  phoneNumber: string;
  customAttributes: string;
  emailLinkSignin: boolean;
  tenantId: string;
  mfaInfo: MfaEnrollment[];
  initialEmail: string;
  lastRefreshAt: string;
}

const apiClient = new Client({ urlPrefix: identityOrigin(), auth: true });

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
 * getAuthUser
 * @param project project identifier.
 * @param email the users email to lookup.
 * @param phone the users phone number to lookup.
 * @param uid the users id to lookup.
 * @param limit the amount of results to return.
 * @param offset the amount to page through the results
 * @return an array of user info
 */
export async function getAuthUser(
  project: string,
  email?: string,
  phone?: string,
  uid?: string,
  limit = 1000,
  offset = 0,
): Promise<{ recordCount: string; userInfo: UserInfo }[]> {
  const expression: { email?: string; phoneNumber?: string; userId?: string } = { email, phoneNumber: phone, userId: uid };
  const res = await apiClient.post<
    {
      limit: string;
      offset: string;
      expression: { email?: string; phoneNumber?: string; userId?: string }[];
    },
    {
      recordCount: string;
      userInfo: UserInfo;
    }[]
  >(`/v1/projects/${project}/accounts:query`, {
    expression: [expression],
    limit: limit.toString(),
    offset: offset.toString(),
  });
  return res.body;
}
