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

export interface UserInfo {
  uid?: string;
  localId?: string;
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
  phoneNumber: string;
  customAttributes?: string;
  emailLinkSignin: boolean;
  tenantId: string;
  mfaInfo: MfaEnrollment[];
  initialEmail: string;
  lastRefreshAt: string;
}

interface SetAccountInfoResponse {
  localId: string;
  idToken: string;
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
  newEmail: string;
  refreshToken: string;
  expiresIn: string;
  emailVerified: boolean;
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
 * findUser searches for an auth user in a project.
 * @param project project identifier.
 * @param email the users email to lookup.
 * @param phone the users phone number to lookup.
 * @param uid the users id to lookup.
 * @return an array of user info
 */
export async function findUser(
  project: string,
  email?: string,
  phone?: string,
  uid?: string,
): Promise<UserInfo> {
  const expression: { email?: string; phoneNumber?: string; userId?: string } = {
    email,
    phoneNumber: phone,
    userId: uid,
  };
  const res = await apiClient.post<
    {
      limit: string;
      expression: { email?: string; phoneNumber?: string; userId?: string }[];
    },
    {
      recordsCount: string;
      userInfo: UserInfo[];
    }
  >(`/v1/projects/${project}/accounts:query`, {
    expression: [expression],
    limit: "1",
  });
  if (!res.body.userInfo?.length) {
    throw new Error("No users found");
  }
  const modifiedUserInfo = res.body.userInfo.map((ui) => {
    ui.uid = ui.localId;
    delete ui.localId;
    return ui;
  });
  return modifiedUserInfo[0];
}

/**
 * listUsers returns all auth users in a project.
 * @param project project identifier.
 * @param limit the total number of users to return.
 * @return an array of users info
 */
export async function listUsers(project: string, limit: number): Promise<UserInfo[]> {
  let queryLimit = limit;
  let offset = 0;
  if (limit > 500) {
    queryLimit = 500;
  }
  const userInfo: UserInfo[] = [];
  while (offset < limit) {
    if (queryLimit + offset > limit) {
      queryLimit = limit - offset;
    }
    const res = await apiClient.post<
      {
        limit: string;
        offset: string;
      },
      {
        recordsCount: string;
        userInfo: UserInfo[];
      }
    >(`/v1/projects/${project}/accounts:query`, {
      offset: offset.toString(),
      limit: queryLimit.toString(),
    });
    if (res.body.recordsCount === "0") {
      break;
    }
    offset += Number(res.body.recordsCount);
    const modifiedUserInfo = res.body.userInfo.map((ui) => {
      ui.uid = ui.localId;
      delete ui.localId;
      return ui;
    });
    userInfo.push(...modifiedUserInfo);
  }
  return userInfo;
}

/**
 * disableUser disables or enables a user from a particular project.
 * @param project project identifier.
 * @param uid the user id of the user from the firebase project.
 * @param disabled sets whether the user is marked as disabled (true) or enabled (false).
 * @return the call succeeded (true).
 */
export async function disableUser(
  project: string,
  uid: string,
  disabled: boolean,
): Promise<boolean> {
  const res = await apiClient.post<
    { disableUser: boolean; targetProjectId: string; localId: string },
    SetAccountInfoResponse
  >("/v1/accounts:update", {
    disableUser: disabled,
    targetProjectId: project,
    localId: uid,
  });
  return res.status === 200;
}

/**
 * setCustomClaim sets a new custom claim on the uid specified in the project.
 * @param project project identifier.
 * @param uid the user id of the user from the firebase project.
 * @param claim the key value in the custom claim.
 * @param options modifiers to setting custom claims
 * @param options.merge whether to preserve the existing custom claims on the user
 * @return the results of the accounts update request.
 */
export async function setCustomClaim(
  project: string,
  uid: string,
  claim: Record<string, unknown>,
  options?: { merge?: boolean },
): Promise<UserInfo> {
  let user = await findUser(project, undefined, undefined, uid);
  if (user.uid !== uid) {
    throw new Error(`Could not find ${uid} in the auth db, please check the uid again.`);
  }
  let reqClaim = JSON.stringify(claim);
  if (options?.merge) {
    let attributeJson = new Map<string, string | number | boolean>();
    if (user.customAttributes !== undefined && user.customAttributes !== "") {
      attributeJson = JSON.parse(user.customAttributes) as Map<string, string | number | boolean>;
    }
    reqClaim = JSON.stringify({ ...attributeJson, ...claim });
  }
  const res = await apiClient.post<
    { customAttributes: string; targetProjectId: string; localId: string },
    SetAccountInfoResponse
  >("/v1/accounts:update", {
    customAttributes: reqClaim,
    targetProjectId: project,
    localId: uid,
  });
  if (res.status !== 200) {
    throw new Error("something went wrong in the request");
  }
  user = await findUser(project, undefined, undefined, uid);
  return user;
}

/**
 * setAllowSmsRegionPolicy updates the allowed regions for sms auth and MFA in Firebase.
 * @param project project identifier.
 * @param countryCodes the country codes to allow based on ISO 3166.
 * @return call success.
 */
export async function setAllowSmsRegionPolicy(
  project: string,
  countryCodes: string[],
): Promise<boolean> {
  const res = await apiClient.patch<
    { sms_region_config: { allowlist_only: { allowed_regions: string[] } } },
    {}
  >(`/admin/v2/projects/${project}/config?updateMask=sms_region_config`, {
    sms_region_config: {
      allowlist_only: {
        allowed_regions: countryCodes,
      },
    },
  });
  if (res.status !== 200) {
    throw new Error("SMS Region Policy failed to be configured");
  }
  return true;
}

/**
 * setDenySmsRegionPolicy updates the deny regions for sms auth and MFA in Firebase.
 * @param project project identifier.
 * @param countryCodes the country codes to allow based on ISO 3166.
 * @return call success.
 */
export async function setDenySmsRegionPolicy(
  project: string,
  countryCodes: string[],
): Promise<boolean> {
  const res = await apiClient.patch<
    { sms_region_config: { allow_by_default: { disallowed_regions: string[] } } },
    {}
  >(`/admin/v2/projects/${project}/config?updateMask=sms_region_config`, {
    sms_region_config: {
      allow_by_default: {
        disallowed_regions: countryCodes,
      },
    },
  });
  if (res.status !== 200) {
    throw new Error("SMS Region Policy failed to be configured");
  }
  return true;
}
