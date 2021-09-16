import {
  randomBase64UrlStr,
  randomId,
  mirrorFieldTo,
  randomDigits,
  isValidPhoneNumber,
} from "./utils";
import { MakeRequired } from "./utils";
import { AuthCloudFunction } from "./cloudFunctions";
import { assert, NotImplementedError } from "./errors";
import { MfaEnrollments, Schemas } from "./types";

export const PROVIDER_PASSWORD = "password";
export const PROVIDER_PHONE = "phone";
export const PROVIDER_ANONYMOUS = "anonymous";
export const PROVIDER_CUSTOM = "custom";
export const PROVIDER_GAME_CENTER = "gc.apple.com"; // Not yet implemented

export const SIGNIN_METHOD_EMAIL_LINK = "emailLink";

export abstract class ProjectState {
  private users: Map<string, UserInfo> = new Map();
  private localIdForEmail: Map<string, string> = new Map();
  private localIdForInitialEmail: Map<string, string> = new Map();
  private localIdForPhoneNumber: Map<string, string> = new Map();
  private localIdsForProviderEmail: Map<string, Set<string>> = new Map();
  private userIdForProviderRawId: Map<string, Map<string, string>> = new Map();
  private refreshTokens: Map<string, RefreshTokenRecord> = new Map();
  private refreshTokensForLocalId: Map<string, Set<string>> = new Map();
  private oobs: Map<string, OobRecord> = new Map();
  private verificationCodes: Map<string, PhoneVerificationRecord> = new Map();
  private temporaryProofs: Map<string, TemporaryProofRecord> = new Map();

  constructor(public readonly projectId: string) {}

  get projectNumber(): string {
    // TODO: Shall we generate something different for each project?
    // Hard-coding an obviously fake number for clarity for now.
    return "12345";
  }

  abstract get oneAccountPerEmail(): boolean;

  abstract get authCloudFunction(): AuthCloudFunction;

  abstract get usageMode(): UsageMode;

  createUser(props: Omit<UserInfo, "localId" | "createdAt" | "lastRefreshAt">): UserInfo {
    for (let i = 0; i < 10; i++) {
      // Try this for 10 times to prevent ID collision (since our RNG is
      // Math.random() which isn't really that great).
      const localId = randomId(28);
      const user = this.createUserWithLocalId(localId, props);
      if (user) {
        return user;
      }
    }
    // If we get 10 collisions in a row, there must be something very wrong.
    throw new Error("Cannot generate a random unique localId after 10 tries.");
  }

  createUserWithLocalId(
    localId: string,
    props: Omit<UserInfo, "localId" | "lastRefreshAt">
  ): UserInfo | undefined {
    if (this.users.has(localId)) {
      return undefined;
    }
    const timestamp = new Date();
    this.users.set(localId, {
      localId,
      createdAt: props.createdAt || timestamp.getTime().toString(),
      lastLoginAt: timestamp.getTime().toString(),
    });

    const user = this.updateUserByLocalId(localId, props, {
      upsertProviders: props.providerUserInfo,
    });
    this.authCloudFunction.dispatch("create", user);
    return user;
  }

  /**
   * Create or overwrite the user with localId, never triggering functions.
   * @param localId the ID of existing user to overwrite, or create otherwise
   * @param props new properties of the user
   * @return the hydrated UserInfo of the created/updated user in state
   */
  overwriteUserWithLocalId(
    localId: string,
    props: Omit<UserInfo, "localId" | "lastRefreshAt">
  ): UserInfo {
    const userInfoBefore = this.users.get(localId);
    if (userInfoBefore) {
      // For consistency, nuke internal indexes for old fields (e.g. email).
      this.removeUserFromIndex(userInfoBefore);
    }
    const timestamp = new Date();
    this.users.set(localId, {
      localId,
      createdAt: props.createdAt || timestamp.getTime().toString(),
      lastLoginAt: timestamp.getTime().toString(),
    });

    const user = this.updateUserByLocalId(localId, props, {
      upsertProviders: props.providerUserInfo,
    });
    return user;
  }

  deleteUser(user: UserInfo): void {
    this.users.delete(user.localId);
    this.removeUserFromIndex(user);

    const refreshTokens = this.refreshTokensForLocalId.get(user.localId);
    if (refreshTokens) {
      this.refreshTokensForLocalId.delete(user.localId);
      for (const refreshToken of refreshTokens) {
        this.refreshTokens.delete(refreshToken);
      }
    }

    this.authCloudFunction.dispatch("delete", user);
  }

  updateUserByLocalId(
    localId: string,
    fields: Omit<Partial<UserInfo>, "localId" | "providerUserInfo">,
    options: {
      upsertProviders?: ProviderUserInfo[];
      deleteProviders?: string[];
    } = {}
  ): UserInfo {
    const upsertProviders = options.upsertProviders ?? [];
    const deleteProviders = options.deleteProviders ?? [];
    const user = this.users.get(localId);
    if (!user) {
      throw new Error(`Internal assertion error: trying to update nonexistent user: ${localId}`);
    }
    const oldEmail = user.email;
    const oldPhoneNumber = user.phoneNumber;

    for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
      mirrorFieldTo(user, field, fields);
    }

    if (oldEmail && oldEmail !== user.email) {
      this.localIdForEmail.delete(oldEmail);
    }
    if (user.email) {
      this.localIdForEmail.set(user.email, user.localId);
    }
    if (user.email && (user.passwordHash || user.emailLinkSignin)) {
      upsertProviders.push({
        providerId: PROVIDER_PASSWORD,
        email: user.email,
        federatedId: user.email,
        rawId: user.email,
        displayName: user.displayName,
        photoUrl: user.photoUrl,
      });
    } else {
      deleteProviders.push(PROVIDER_PASSWORD);
    }

    if (user.initialEmail) {
      this.localIdForInitialEmail.set(user.initialEmail, user.localId);
    }

    if (oldPhoneNumber && oldPhoneNumber !== user.phoneNumber) {
      this.localIdForPhoneNumber.delete(oldPhoneNumber);
    }
    if (user.phoneNumber) {
      this.localIdForPhoneNumber.set(user.phoneNumber, user.localId);
      upsertProviders.push({
        providerId: PROVIDER_PHONE,
        phoneNumber: user.phoneNumber,
        rawId: user.phoneNumber,
      });
    } else {
      deleteProviders.push(PROVIDER_PHONE);
    }

    // if MFA info is specified on the user, ensure MFA data is valid before returning.
    // callers are expected to have called `validateMfaEnrollments` prior to having called
    // this method.
    if (user.mfaInfo) {
      this.validateMfaEnrollments(user.mfaInfo);
    }

    return this.updateUserProviderInfo(user, upsertProviders, deleteProviders);
  }

  /**
   * Validates a collection of MFA Enrollments. If all data is valid, returns the data
   * unmodified to the caller.
   *
   * @param enrollments the MFA Enrollments to validate. each enrollment must have a valid and unique phone number, a non-null enrollment ID,
   * and the enrollment ID must be unique across all other enrollments in the array.
   * @returns the validated MFA Enrollments passed to this method
   * @throws BadRequestError if the phone number is absent or invalid
   * @throws BadRequestError if the MFA Enrollment ID is absent
   * @throws BadRequestError if the MFA Enrollment ID is duplicated in the provided array
   * @throws BadRequestError if any of the phone numbers are duplicated. callers should de-duplicate phone numbers
   * prior to calling this validation method, as the real API is lenient and removes duplicates from requests
   * for well-formed create/update requests.
   */
  validateMfaEnrollments(enrollments: MfaEnrollments): MfaEnrollments {
    const phoneNumbers: Set<string> = new Set<string>();
    const enrollmentIds: Set<string> = new Set<string>();
    for (const enrollment of enrollments) {
      assert(
        enrollment.phoneInfo && isValidPhoneNumber(enrollment.phoneInfo),
        "INVALID_MFA_PHONE_NUMBER : Invalid format."
      );
      assert(
        enrollment.mfaEnrollmentId,
        "INVALID_MFA_ENROLLMENT_ID : mfaEnrollmentId must be defined."
      );
      assert(!enrollmentIds.has(enrollment.mfaEnrollmentId), "DUPLICATE_MFA_ENROLLMENT_ID");
      assert(
        !phoneNumbers.has(enrollment.phoneInfo),
        "INTERNAL_ERROR : MFA Enrollment Phone Numbers must be unique."
      );
      phoneNumbers.add(enrollment.phoneInfo);
      enrollmentIds.add(enrollment.mfaEnrollmentId);
    }
    return enrollments;
  }

  private updateUserProviderInfo(
    user: UserInfo,
    upsertProviders: ProviderUserInfo[],
    deleteProviders: string[]
  ): UserInfo {
    const oldProviderEmails = getProviderEmailsForUser(user);

    if (user.providerUserInfo) {
      const updatedProviderUserInfo: ProviderUserInfo[] = [];
      for (const info of user.providerUserInfo) {
        if (deleteProviders.includes(info.providerId)) {
          this.userIdForProviderRawId.get(info.providerId)?.delete(info.rawId);
        } else {
          updatedProviderUserInfo.push(info);
        }
      }
      user.providerUserInfo = updatedProviderUserInfo;
    }

    if (upsertProviders.length) {
      user.providerUserInfo = user.providerUserInfo ?? [];
      for (const upsert of upsertProviders) {
        const providerId = upsert.providerId;
        let users = this.userIdForProviderRawId.get(providerId);
        if (!users) {
          users = new Map();
          this.userIdForProviderRawId.set(providerId, users);
        }
        users.set(upsert.rawId, user.localId);

        const index = user.providerUserInfo.findIndex(
          (info) => info.providerId === upsert.providerId
        );
        if (index < 0) {
          user.providerUserInfo.push(upsert);
        } else {
          user.providerUserInfo[index] = upsert;
        }
      }
    }

    for (const email of getProviderEmailsForUser(user)) {
      oldProviderEmails.delete(email);
      let localIds = this.localIdsForProviderEmail.get(email);
      if (!localIds) {
        localIds = new Set();
        this.localIdsForProviderEmail.set(email, localIds);
      }
      localIds.add(user.localId);
    }
    for (const oldEmail of oldProviderEmails) {
      this.removeProviderEmailForUser(oldEmail, user.localId);
    }
    return user;
  }

  getUserByEmail(email: string): UserInfo | undefined {
    const localId = this.localIdForEmail.get(email);
    if (!localId) {
      return undefined;
    }
    return this.getUserByLocalIdAssertingExists(localId);
  }

  getUserByInitialEmail(initialEmail: string): UserInfo | undefined {
    const localId = this.localIdForInitialEmail.get(initialEmail);
    if (!localId) {
      return undefined;
    }
    return this.getUserByLocalIdAssertingExists(localId);
  }

  private getUserByLocalIdAssertingExists(localId: string): UserInfo {
    const userInfo = this.getUserByLocalId(localId);
    if (!userInfo) {
      throw new Error(`Internal state invariant broken: no user with ID: ${localId}`);
    }
    return userInfo;
  }

  getUsersByEmailOrProviderEmail(email: string): UserInfo[] {
    const users: UserInfo[] = [];
    const seenLocalIds = new Set<string>();
    const localId = this.localIdForEmail.get(email);
    if (localId) {
      users.push(this.getUserByLocalIdAssertingExists(localId));
      seenLocalIds.add(localId);
    }
    for (const localId of this.localIdsForProviderEmail.get(email) ?? []) {
      if (!seenLocalIds.has(localId)) {
        users.push(this.getUserByLocalIdAssertingExists(localId));
        seenLocalIds.add(localId);
      }
    }
    return users;
  }

  getUserByPhoneNumber(phoneNumber: string): UserInfo | undefined {
    const localId = this.localIdForPhoneNumber.get(phoneNumber);
    if (!localId) {
      return undefined;
    }
    return this.getUserByLocalIdAssertingExists(localId);
  }

  private removeProviderEmailForUser(email: string, localId: string): void {
    const localIds = this.localIdsForProviderEmail.get(email);
    if (!localIds) {
      return;
    }
    localIds.delete(localId);
    if (localIds.size === 0) {
      this.localIdsForProviderEmail.delete(email);
    }
  }

  getUserByProviderRawId(provider: string, rawId: string): UserInfo | undefined {
    const localId = this.userIdForProviderRawId.get(provider)?.get(rawId);
    if (!localId) {
      return undefined;
    }
    return this.getUserByLocalIdAssertingExists(localId);
  }

  listProviderInfosByProviderId(provider: string): ProviderUserInfo[] {
    const users = this.userIdForProviderRawId.get(provider);
    if (!users) {
      return [];
    }
    const infos: ProviderUserInfo[] = [];
    for (const localId of users.values()) {
      const user = this.getUserByLocalIdAssertingExists(localId);
      const info = user.providerUserInfo?.find((info) => info.providerId === provider);
      if (!info) {
        throw new Error(
          `Internal assertion error: User ${localId} does not have providerInfo ${provider}.`
        );
      }
      infos.push(info);
    }
    return infos;
  }

  getUserByLocalId(localId: string): UserInfo | undefined {
    return this.users.get(localId);
  }

  createRefreshTokenFor(
    userInfo: UserInfo,
    provider: string,
    {
      extraClaims = {},
      secondFactor,
    }: {
      extraClaims?: Record<string, unknown>;
      secondFactor?: SecondFactorRecord;
    } = {}
  ): string {
    const localId = userInfo.localId;
    const refreshToken = randomBase64UrlStr(204);
    this.refreshTokens.set(refreshToken, { localId, provider, extraClaims, secondFactor });
    let refreshTokens = this.refreshTokensForLocalId.get(localId);
    if (!refreshTokens) {
      refreshTokens = new Set();
      this.refreshTokensForLocalId.set(localId, refreshTokens);
    }
    refreshTokens.add(refreshToken);
    return refreshToken;
  }

  validateRefreshToken(
    refreshToken: string
  ):
    | {
        user: UserInfo;
        provider: string;
        extraClaims: Record<string, unknown>;
        secondFactor?: SecondFactorRecord;
      }
    | undefined {
    const record = this.refreshTokens.get(refreshToken);
    if (!record) {
      return undefined;
    }
    return {
      user: this.getUserByLocalIdAssertingExists(record.localId),
      provider: record.provider,
      extraClaims: record.extraClaims,
      secondFactor: record.secondFactor,
    };
  }

  createOob(
    email: string,
    requestType: OobRequestType,
    generateLink: (oobCode: string) => string
  ): OobRecord {
    const oobCode = randomBase64UrlStr(54);
    const oobLink = generateLink(oobCode);

    const oob: OobRecord = {
      email,
      requestType,
      oobCode,
      oobLink,
    };
    this.oobs.set(oobCode, oob);
    return oob;
  }

  validateOobCode(oobCode: string): OobRecord | undefined {
    return this.oobs.get(oobCode);
  }

  deleteOobCode(oobCode: string): boolean {
    return this.oobs.delete(oobCode);
  }

  listOobCodes(): Iterable<OobRecord> {
    return this.oobs.values();
  }

  createVerificationCode(phoneNumber: string): PhoneVerificationRecord {
    const sessionInfo = randomBase64UrlStr(226);
    const verification: PhoneVerificationRecord = {
      code: randomDigits(6),
      phoneNumber,
      sessionInfo,
    };
    this.verificationCodes.set(sessionInfo, verification);
    return verification;
  }

  getVerificationCodeBySessionInfo(sessionInfo: string): PhoneVerificationRecord | undefined {
    return this.verificationCodes.get(sessionInfo);
  }

  deleteVerificationCodeBySessionInfo(sessionInfo: string): boolean {
    return this.verificationCodes.delete(sessionInfo);
  }

  listVerificationCodes(): Iterable<PhoneVerificationRecord> {
    return this.verificationCodes.values();
  }

  deleteAllAccounts(): void {
    this.users.clear();
    this.localIdForEmail.clear();
    this.localIdForPhoneNumber.clear();
    this.localIdsForProviderEmail.clear();
    this.userIdForProviderRawId.clear();
    this.refreshTokens.clear();
    this.refreshTokensForLocalId.clear();

    // We do not clear OOBs / phone verification codes since some of those may
    // still be valid (e.g. email link / phone sign-in may still create a new
    // user when the code is applied). Others will become invalid and clients
    // will find out when they try consuming them via API endpoints.
  }

  getUserCount(): number {
    return this.users.size;
  }

  queryUsers(
    filter: {
      /* no filter supported yet */
    },
    options: {
      order: "ASC" | "DESC";
      sortByField: "localId";
      startToken?: string;
    }
  ): UserInfo[] {
    const users = [];
    for (const user of this.users.values()) {
      if (!options.startToken || user.localId > options.startToken) {
        /* TODO */ filter;
        users.push(user);
      }
    }
    users.sort((a, b) => {
      if (options.sortByField === "localId") {
        if (a.localId < b.localId) {
          return -1;
        } else if (a.localId > b.localId) {
          return 1;
        }
      }
      return 0;
    });
    return options.order === "DESC" ? users.reverse() : users;
  }

  createTemporaryProof(phoneNumber: string): TemporaryProofRecord {
    const record: TemporaryProofRecord = {
      phoneNumber,
      temporaryProof: randomBase64UrlStr(119),
      temporaryProofExpiresIn: "3600",
    };
    this.temporaryProofs.set(record.temporaryProof, record);
    return record;
  }

  validateTemporaryProof(
    temporaryProof: string,
    phoneNumber: string
  ): TemporaryProofRecord | undefined {
    const record = this.temporaryProofs.get(temporaryProof);
    if (!record || record.phoneNumber !== phoneNumber) {
      return undefined;
    }
    return record;
  }

  // This method removes the user from internal indexes like localIdForEmail.
  // It should be used only for deleting or overwriting users.
  private removeUserFromIndex(user: UserInfo): void {
    if (user.email) {
      this.localIdForEmail.delete(user.email);
    }

    if (user.initialEmail) {
      this.localIdForInitialEmail.delete(user.initialEmail);
    }

    if (user.phoneNumber) {
      this.localIdForPhoneNumber.delete(user.phoneNumber);
    }

    for (const info of user.providerUserInfo ?? []) {
      this.userIdForProviderRawId.get(info.providerId)?.delete(info.rawId);
      if (info.email) {
        this.removeProviderEmailForUser(info.email, user.localId);
      }
    }
  }
}

export class AgentProjectState extends ProjectState {
  private tenantForTenantId: Map<string, Tenant> = new Map();
  private _oneAccountPerEmail = true;
  private _usageMode = UsageMode.DEFAULT;
  private readonly _authCloudFunction = new AuthCloudFunction(this.projectId);

  constructor(projectId: string) {
    super(projectId);
  }

  get authCloudFunction() {
    return this._authCloudFunction;
  }

  get oneAccountPerEmail() {
    return this._oneAccountPerEmail;
  }

  set oneAccountPerEmail(oneAccountPerEmail: boolean) {
    this._oneAccountPerEmail = oneAccountPerEmail;
  }

  get usageMode() {
    return this._usageMode;
  }

  set usageMode(usageMode: UsageMode) {
    this._usageMode = usageMode;
  }

  // TODO(lisajian): Fill in when v2.projects.tenants.get is added
  getTenant(): void {
    throw new NotImplementedError("getTenant is not implemented yet.");
  }

  // TODO(lisajian): Fill in when v2.projects.tenants.list is added
  listTenants(): void {
    throw new NotImplementedError("listTenants is not implemented yet.");
  }

  // TODO(lisajian): Fill in when v2.projects.tenants.create is added
  createTenant(): void {
    throw new NotImplementedError("createTenant is not implemented yet.");
  }

  // TODO(lisajian): Fill in when v2.projects.tenants.patch is added
  updateTenant(): void {
    throw new NotImplementedError("updateTenant is not implemented yet.");
  }

  // TODO(lisajian): Fill in when v2.projects.tenants.delete is added
  deleteTenant(): void {
    throw new NotImplementedError("deleteTenant is not implemented yet.");
  }
}

export class TenantProjectState extends ProjectState {
  constructor(
    projectId: string,
    readonly tenantId: string,
    private readonly parentProject: AgentProjectState
  ) {
    super(projectId);
  }

  get oneAccountPerEmail() {
    return this.parentProject.oneAccountPerEmail;
  }

  get authCloudFunction() {
    return this.parentProject.authCloudFunction;
  }

  get usageMode() {
    return this.parentProject.usageMode;
  }
}

export type ProviderUserInfo = MakeRequired<
  Schemas["GoogleCloudIdentitytoolkitV1ProviderUserInfo"],
  "rawId" | "providerId"
>;
export type UserInfo = Omit<
  Schemas["GoogleCloudIdentitytoolkitV1UserInfo"],
  "localId" | "providerUserInfo"
> & {
  localId: string;
  providerUserInfo?: ProviderUserInfo[];
};
export type Tenant = Schemas["GoogleCloudIdentitytoolkitAdminV2Tenant"];

interface RefreshTokenRecord {
  localId: string;
  provider: string;
  extraClaims: Record<string, unknown>;
  secondFactor?: SecondFactorRecord;
}

export interface SecondFactorRecord {
  identifier: string;
  provider: string;
}

export type OobRequestType = NonNullable<
  Schemas["GoogleCloudIdentitytoolkitV1GetOobCodeRequest"]["requestType"]
>;

export interface OobRecord {
  email: string;
  oobLink: string;
  oobCode: string;
  requestType: OobRequestType;
}

export interface PhoneVerificationRecord {
  code: string;
  phoneNumber: string;
  sessionInfo: string;
}

interface TemporaryProofRecord {
  phoneNumber: string;
  temporaryProof: string;
  temporaryProofExpiresIn: string;
  // Temporary proofs in emulator never expire to make interactive debugging
  // a bit easier. Therefore, there's no need to record createdAt timestamps.
}

function getProviderEmailsForUser(user: UserInfo): Set<string> {
  const emails = new Set<string>();
  user.providerUserInfo?.forEach(({ email }) => {
    if (email) {
      emails.add(email);
    }
  });
  return emails;
}

export enum UsageMode {
  DEFAULT = "DEFAULT",
  PASSTHROUGH = "PASSTHROUGH",
}
