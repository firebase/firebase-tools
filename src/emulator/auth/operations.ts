import { URLSearchParams } from "url";
import { decode as decodeJwt, sign as signJwt, JwtHeader } from "jsonwebtoken";
import * as express from "express";
import fetch from "node-fetch";
import AbortController from "abort-controller";
import { ExegesisContext } from "exegesis-express";
import {
  toUnixTimestamp,
  randomId,
  isValidEmailAddress,
  parseAbsoluteUri,
  canonicalizeEmailAddress,
  mirrorFieldTo,
  authEmulatorUrl,
  MakeRequired,
  isValidPhoneNumber,
  randomBase64UrlStr,
} from "./utils";
import { NotImplementedError, assert, BadRequestError, InternalError } from "./errors";
import { Emulators } from "../types";
import { EmulatorLogger } from "../emulatorLogger";
import {
  ProjectState,
  OobRequestType,
  UserInfo,
  ProviderUserInfo,
  PROVIDER_PASSWORD,
  PROVIDER_ANONYMOUS,
  PROVIDER_PHONE,
  SIGNIN_METHOD_EMAIL_LINK,
  PROVIDER_CUSTOM,
  OobRecord,
  PROVIDER_GAME_CENTER,
  SecondFactorRecord,
  AgentProjectState,
  TenantProjectState,
  MfaConfig,
  BlockingFunctionEvents,
} from "./state";
import { MfaEnrollments, Schemas } from "./types";

/**
 * Create a map from IDs to operations handlers suitable for exegesis.
 * @param state the state of the Auth Emulator
 * @return operations, keyed by their operation id.
 */
export const authOperations: AuthOps = {
  identitytoolkit: {
    getProjects,
    getRecaptchaParams,

    accounts: {
      createAuthUri,
      delete: deleteAccount,
      lookup,
      resetPassword,
      sendOobCode,
      sendVerificationCode,
      signInWithCustomToken,
      signInWithEmailLink,
      signInWithIdp,
      signInWithPassword,
      signInWithPhoneNumber,
      signUp,
      update: setAccountInfo,
      mfaEnrollment: {
        finalize: mfaEnrollmentFinalize,
        start: mfaEnrollmentStart,
        withdraw: mfaEnrollmentWithdraw,
      },
      mfaSignIn: {
        start: mfaSignInStart,
        finalize: mfaSignInFinalize,
      },
    },
    projects: {
      createSessionCookie,
      queryAccounts,
      getConfig,
      updateConfig,
      accounts: {
        _: signUp,
        delete: deleteAccount,
        lookup,
        query: queryAccounts,
        sendOobCode,
        update: setAccountInfo,
        batchCreate,
        batchDelete,
        batchGet,
      },
      tenants: {
        create: createTenant,
        delete: deleteTenant,
        get: getTenant,
        list: listTenants,
        patch: updateTenant,
        createSessionCookie,
        accounts: {
          _: signUp,
          batchCreate,
          batchDelete,
          batchGet,
          delete: deleteAccount,
          lookup,
          query: queryAccounts,
          sendOobCode,
          update: setAccountInfo,
        },
      },
    },
  },
  securetoken: {
    token: grantToken,
  },
  emulator: {
    projects: {
      accounts: {
        delete: deleteAllAccountsInProject,
      },
      config: {
        get: getEmulatorProjectConfig,
        update: updateEmulatorProjectConfig,
      },
      oobCodes: {
        list: listOobCodesInProject,
      },
      verificationCodes: {
        list: listVerificationCodesInProject,
      },
    },
  },
};

/* Handlers */

const PASSWORD_MIN_LENGTH = 6;

// https://cloud.google.com/identity-platform/docs/use-rest-api#section-verify-custom-token
export const CUSTOM_TOKEN_AUDIENCE =
  "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

const MFA_INELIGIBLE_PROVIDER = new Set([
  PROVIDER_ANONYMOUS,
  PROVIDER_PHONE,
  PROVIDER_CUSTOM,
  PROVIDER_GAME_CENTER,
]);

async function signUp(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SignUpRequest"],
  ctx: ExegesisContext
): Promise<Schemas["GoogleCloudIdentitytoolkitV1SignUpResponse"]> {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  let provider: string | undefined;
  const timestamp = new Date();
  let updates: Omit<Partial<UserInfo>, "localId" | "providerUserInfo"> = {
    lastLoginAt: timestamp.getTime().toString(),
  };

  if (ctx.security?.Oauth2) {
    // Privileged request.
    if (reqBody.idToken) {
      assert(!reqBody.localId, "UNEXPECTED_PARAMETER : User ID");
    }
    if (reqBody.localId) {
      // Fail fast if localId is taken (matching production behavior).
      assert(!state.getUserByLocalId(reqBody.localId), "DUPLICATE_LOCAL_ID");
    }

    updates.displayName = reqBody.displayName;
    updates.photoUrl = reqBody.photoUrl;
    updates.emailVerified = reqBody.emailVerified || false;
    if (reqBody.phoneNumber) {
      assert(isValidPhoneNumber(reqBody.phoneNumber), "INVALID_PHONE_NUMBER : Invalid format.");
      assert(!state.getUserByPhoneNumber(reqBody.phoneNumber), "PHONE_NUMBER_EXISTS");
      updates.phoneNumber = reqBody.phoneNumber;
    }
    if (reqBody.disabled) {
      updates.disabled = true;
    }
  } else {
    assert(!reqBody.localId, "UNEXPECTED_PARAMETER : User ID");
    if (reqBody.idToken || reqBody.password || reqBody.email) {
      // Creating / linking email password account.
      updates.displayName = reqBody.displayName;
      updates.emailVerified = false;

      assert(reqBody.email, "MISSING_EMAIL");
      assert(reqBody.password, "MISSING_PASSWORD");
      provider = PROVIDER_PASSWORD;
      assert(state.allowPasswordSignup, "OPERATION_NOT_ALLOWED");
    } else {
      // Most attributes are ignored when creating anon user without privilege.
      provider = PROVIDER_ANONYMOUS;
      assert(state.enableAnonymousUser, "ADMIN_ONLY_OPERATION");
    }
  }

  if (reqBody.email) {
    assert(isValidEmailAddress(reqBody.email), "INVALID_EMAIL");
    const email = canonicalizeEmailAddress(reqBody.email);
    assert(!state.getUserByEmail(email), "EMAIL_EXISTS");
    updates.email = email;
  }
  if (reqBody.password) {
    assert(
      reqBody.password.length >= PASSWORD_MIN_LENGTH,
      `WEAK_PASSWORD : Password should be at least ${PASSWORD_MIN_LENGTH} characters`
    );
    updates.salt = "fakeSalt" + randomId(20);
    updates.passwordHash = hashPassword(reqBody.password, updates.salt);
    updates.passwordUpdatedAt = Date.now();
    updates.validSince = toUnixTimestamp(new Date()).toString();
  }
  if (reqBody.mfaInfo) {
    updates.mfaInfo = getMfaEnrollmentsFromRequest(state, reqBody.mfaInfo, {
      generateEnrollmentIds: true,
    });
  }
  if (state instanceof TenantProjectState) {
    updates.tenantId = state.tenantId;
  }
  let user: UserInfo | undefined;
  if (reqBody.idToken) {
    ({ user } = parseIdToken(state, reqBody.idToken));
  }

  let extraClaims;
  if (!user) {
    updates.createdAt = timestamp.getTime().toString();
    const localId = reqBody.localId ?? state.generateLocalId();
    if (reqBody.email && !ctx.security?.Oauth2) {
      const userBeforeCreate = { localId, ...updates };
      const blockingResponse = await fetchBlockingFunction(
        state,
        BlockingFunctionEvents.BEFORE_CREATE,
        userBeforeCreate,
        { signInMethod: "password" }
      );
      updates = { ...updates, ...blockingResponse.updates };
    }

    user = state.createUserWithLocalId(localId, updates);
    assert(user, "DUPLICATE_LOCAL_ID");

    if (reqBody.email && !ctx.security?.Oauth2) {
      if (!user.disabled) {
        const blockingResponse = await fetchBlockingFunction(
          state,
          BlockingFunctionEvents.BEFORE_SIGN_IN,
          user,
          { signInMethod: "password" }
        );
        updates = blockingResponse.updates;
        extraClaims = blockingResponse.extraClaims;
        user = state.updateUserByLocalId(user.localId, updates);
      }
      // User may have been disabled after either blocking function, but
      // only throw after writing user to store
      assert(!user.disabled, "USER_DISABLED");
    }
  } else {
    user = state.updateUserByLocalId(user.localId, updates);
  }

  return {
    kind: "identitytoolkit#SignupNewUserResponse",
    localId: user.localId,
    displayName: user.displayName,
    email: user.email,
    ...(provider ? issueTokens(state, user, provider, { extraClaims }) : {}),
  };
}

function lookup(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1GetAccountInfoRequest"],
  ctx: ExegesisContext
): Schemas["GoogleCloudIdentitytoolkitV1GetAccountInfoResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  const seenLocalIds = new Set<string>();
  const users: UserInfo[] = [];
  function tryAddUser(maybeUser: UserInfo | undefined): void {
    if (maybeUser && !seenLocalIds.has(maybeUser.localId)) {
      users.push(maybeUser);
      seenLocalIds.add(maybeUser.localId);
    }
  }

  if (ctx.security?.Oauth2) {
    if (reqBody.initialEmail) {
      // TODO: This is now possible. See ProjectState.getUserByInitialEmail.
      throw new NotImplementedError("Lookup by initialEmail is not implemented.");
    }
    for (const localId of reqBody.localId ?? []) {
      tryAddUser(state.getUserByLocalId(localId));
    }
    for (const email of reqBody.email ?? []) {
      tryAddUser(state.getUserByEmail(email));
    }
    for (const phoneNumber of reqBody.phoneNumber ?? []) {
      tryAddUser(state.getUserByPhoneNumber(phoneNumber));
    }
    for (const { providerId, rawId } of reqBody.federatedUserId ?? []) {
      if (!providerId || !rawId) {
        continue;
      }
      tryAddUser(state.getUserByProviderRawId(providerId, rawId));
    }
  } else {
    assert(reqBody.idToken, "MISSING_ID_TOKEN");
    const { user } = parseIdToken(state, reqBody.idToken);
    users.push(redactPasswordHash(user));
  }
  return {
    kind: "identitytoolkit#GetAccountInfoResponse",

    // Drop users property if no users are found. This is needed for Node.js
    // Admin SDK: https://github.com/firebase/firebase-admin-node/issues/1078
    users: users.length ? users : undefined,
  };
}

function batchCreate(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1UploadAccountRequest"]
): Schemas["GoogleCloudIdentitytoolkitV1UploadAccountResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(reqBody.users?.length, "MISSING_USER_ACCOUNT");

  if (reqBody.sanityCheck) {
    if (state.oneAccountPerEmail) {
      const existingEmails = new Set<string>();
      for (const userInfo of reqBody.users) {
        if (userInfo.email) {
          assert(!existingEmails.has(userInfo.email), `DUPLICATE_EMAIL : ${userInfo.email}`);
          existingEmails.add(userInfo.email);
        }
      }
    }

    // Check that there is no duplicate (providerId, rawId) tuple.
    const existingProviderAccounts = new Set<string>();
    for (const userInfo of reqBody.users) {
      for (const { providerId, rawId } of userInfo.providerUserInfo ?? []) {
        const key = `${providerId}:${rawId}`;
        assert(
          !existingProviderAccounts.has(key),
          `DUPLICATE_RAW_ID : Provider id(${providerId}), Raw id(${rawId})`
        );
        existingProviderAccounts.add(key);
      }
    }
  }

  if (!reqBody.allowOverwrite) {
    const existingLocalIds = new Set<string>();
    for (const userInfo of reqBody.users) {
      const localId = userInfo.localId || "";
      assert(!existingLocalIds.has(localId), `DUPLICATE_LOCAL_ID : ${localId}`);
      existingLocalIds.add(localId);
    }
  }

  const errors: { index: number; message: string }[] = [];
  for (let index = 0; index < reqBody.users.length; index++) {
    const userInfo = reqBody.users[index];

    try {
      assert(userInfo.localId, "localId is missing");
      const uploadTime = new Date();
      const fields: Omit<Partial<UserInfo>, "localId"> = {
        displayName: userInfo.displayName,
        photoUrl: userInfo.photoUrl,
        lastLoginAt: userInfo.lastLoginAt,
      };
      if (userInfo.tenantId) {
        assert(
          state instanceof TenantProjectState && state.tenantId === userInfo.tenantId,
          "Tenant id in userInfo does not match the tenant id in request."
        );
      }
      if (state instanceof TenantProjectState) {
        fields.tenantId = state.tenantId;
      }

      // password
      if (userInfo.passwordHash) {
        // TODO: Check and block non-emulator hashes.
        fields.passwordHash = userInfo.passwordHash;
        fields.salt = userInfo.salt;
        fields.passwordUpdatedAt = uploadTime.getTime();
      } else if (userInfo.rawPassword) {
        fields.salt = userInfo.salt || "fakeSalt" + randomId(20);
        fields.passwordHash = hashPassword(userInfo.rawPassword, fields.salt);
        fields.passwordUpdatedAt = uploadTime.getTime();
      }

      // custom attrs
      if (userInfo.customAttributes) {
        validateSerializedCustomClaims(userInfo.customAttributes);
        fields.customAttributes = userInfo.customAttributes;
      }

      // federated
      if (userInfo.providerUserInfo) {
        fields.providerUserInfo = [];
        for (const providerUserInfo of userInfo.providerUserInfo) {
          const { providerId, rawId, federatedId } = providerUserInfo;
          if (providerId === PROVIDER_PASSWORD || providerId === PROVIDER_PHONE) {
            // These providers are handled automatically by create / update.
            continue;
          }
          if (!rawId || !providerId) {
            if (!federatedId) {
              assert(false, "federatedId or (providerId & rawId) is required");
            } else {
              // TODO
              assert(
                false,
                "((Parsing federatedId is not implemented in Auth Emulator; please specify providerId AND rawId as a workaround.))"
              );
            }
          }
          const existingUserWithRawId = state.getUserByProviderRawId(providerId, rawId);
          assert(
            !existingUserWithRawId || existingUserWithRawId.localId === userInfo.localId,
            "raw id exists in other account in database"
          );
          fields.providerUserInfo.push({ ...providerUserInfo, providerId, rawId });
        }
      }

      // phone number
      if (userInfo.phoneNumber) {
        assert(isValidPhoneNumber(userInfo.phoneNumber), "phone number format is invalid");
        fields.phoneNumber = userInfo.phoneNumber;
      }

      fields.validSince = toUnixTimestamp(uploadTime).toString();
      fields.createdAt = uploadTime.getTime().toString();
      if (fields.createdAt && !isNaN(Number(userInfo.createdAt))) {
        fields.createdAt = userInfo.createdAt;
      }
      if (userInfo.email) {
        const email = userInfo.email;
        assert(isValidEmailAddress(email), "email is invalid");

        // For simplicity, Auth Emulator performs this check in all cases
        // (unlike production which checks only if (reqBody.sanityCheck && state.oneAccountPerEmail)).
        // We return a non-standard error message in other cases to clarify.
        const existingUserWithEmail = state.getUserByEmail(email);
        assert(
          !existingUserWithEmail || existingUserWithEmail.localId === userInfo.localId,
          reqBody.sanityCheck && state.oneAccountPerEmail
            ? "email exists in other account in database"
            : `((Auth Emulator does not support importing duplicate email: ${email}))`
        );
        fields.email = canonicalizeEmailAddress(email);
      }
      fields.emailVerified = !!userInfo.emailVerified;
      fields.disabled = !!userInfo.disabled;

      // MFA
      if (userInfo.mfaInfo && userInfo.mfaInfo.length > 0) {
        fields.mfaInfo = [];
        assert(fields.email, "Second factor account requires email to be presented.");
        assert(fields.emailVerified, "Second factor account requires email to be verified.");
        const existingIds = new Set<string>();
        for (const enrollment of userInfo.mfaInfo) {
          if (enrollment.mfaEnrollmentId) {
            assert(!existingIds.has(enrollment.mfaEnrollmentId), "Enrollment id already exists.");
            existingIds.add(enrollment.mfaEnrollmentId);
          }
        }

        for (const enrollment of userInfo.mfaInfo) {
          enrollment.mfaEnrollmentId = enrollment.mfaEnrollmentId || newRandomId(28, existingIds);
          enrollment.enrolledAt = enrollment.enrolledAt || new Date().toISOString();
          assert(enrollment.phoneInfo, "Second factor not supported.");
          assert(isValidPhoneNumber(enrollment.phoneInfo), "Phone number format is invalid");
          enrollment.unobfuscatedPhoneInfo = enrollment.phoneInfo;
          fields.mfaInfo.push(enrollment);
        }
      }

      if (state.getUserByLocalId(userInfo.localId)) {
        assert(
          reqBody.allowOverwrite,
          "localId belongs to an existing account - can not overwrite."
        );
      }
      state.overwriteUserWithLocalId(userInfo.localId, fields);
    } catch (e: any) {
      if (e instanceof BadRequestError) {
        // Use friendlier messages for some codes, consistent with production.
        let message = e.message;
        if (message === "INVALID_CLAIMS") {
          message = "Invalid custom claims provided.";
        } else if (message === "CLAIMS_TOO_LARGE") {
          message = "Custom claims provided are too large.";
        } else if (message.startsWith("FORBIDDEN_CLAIM")) {
          message = "Custom claims provided include a reserved claim.";
        }
        errors.push({
          index,
          message,
        });
      } else {
        throw e;
      }
    }
  }
  return {
    kind: "identitytoolkit#UploadAccountResponse",
    error: errors,
  };
}

function batchDelete(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1BatchDeleteAccountsRequest"]
): Schemas["GoogleCloudIdentitytoolkitV1BatchDeleteAccountsResponse"] {
  const errors: Required<
    Schemas["GoogleCloudIdentitytoolkitV1BatchDeleteAccountsResponse"]["errors"]
  > = [];
  const localIds = reqBody.localIds ?? [];
  assert(localIds.length > 0 && localIds.length <= 1000, "LOCAL_ID_LIST_EXCEEDS_LIMIT");

  for (let index = 0; index < localIds.length; index++) {
    const localId = localIds[index];
    const user = state.getUserByLocalId(localId);
    if (!user) {
      continue;
    } else if (!user.disabled && !reqBody.force) {
      errors.push({
        index,
        localId,
        message: "NOT_DISABLED : Disable the account before batch deletion.",
      });
    } else {
      state.deleteUser(user);
    }
  }

  return { errors: errors.length ? errors : undefined };
}

function batchGet(
  state: ProjectState,
  reqBody: unknown,
  ctx: ExegesisContext
): Schemas["GoogleCloudIdentitytoolkitV1DownloadAccountResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  const maxResults = Math.min(Math.floor(ctx.params.query.maxResults) || 20, 1000);

  const users = state.queryUsers(
    {},
    { sortByField: "localId", order: "ASC", startToken: ctx.params.query.nextPageToken }
  );
  let newPageToken: string | undefined = undefined;

  // As a non-standard behavior, passing in maxResults=-1 will return all users.
  if (maxResults >= 0 && users.length >= maxResults) {
    users.length = maxResults;
    if (users.length) {
      newPageToken = users[users.length - 1].localId;
    }
  }

  return {
    kind: "identitytoolkit#DownloadAccountResponse",
    users,
    nextPageToken: newPageToken,
  };
}

function createAuthUri(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1CreateAuthUriRequest"]
): Schemas["GoogleCloudIdentitytoolkitV1CreateAuthUriResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  const sessionId = reqBody.sessionId || randomId(27);
  if (reqBody.providerId) {
    throw new NotImplementedError("Sign-in with IDP is not yet supported.");
  }
  assert(reqBody.identifier, "MISSING_IDENTIFIER");
  assert(reqBody.continueUri, "MISSING_CONTINUE_URI");

  // TODO: What about non-email identifiers?
  assert(isValidEmailAddress(reqBody.identifier), "INVALID_IDENTIFIER");
  const email = canonicalizeEmailAddress(reqBody.identifier);

  assert(parseAbsoluteUri(reqBody.continueUri), "INVALID_CONTINUE_URI");

  const allProviders: string[] = [];
  const signinMethods: string[] = [];

  let registered = false;
  const users = state.getUsersByEmailOrProviderEmail(email);

  if (state.oneAccountPerEmail) {
    if (users.length) {
      registered = true;
      users[0].providerUserInfo?.forEach(({ providerId }) => {
        if (providerId === PROVIDER_PASSWORD) {
          allProviders.push(providerId);
          if (users[0].passwordHash) {
            signinMethods.push(PROVIDER_PASSWORD);
          }
          if (users[0].emailLinkSignin) {
            signinMethods.push(SIGNIN_METHOD_EMAIL_LINK);
          }
        } else if (providerId !== PROVIDER_PHONE) {
          allProviders.push(providerId);
          signinMethods.push(providerId);
        }
      });
    }
  } else {
    // We only report if user has password provider sign-in methods. No IDP.
    const user = users.find((u) => u.email);
    if (user) {
      registered = true;
      if (user.passwordHash || user.emailLinkSignin) {
        allProviders.push(PROVIDER_PASSWORD);
        if (users[0].passwordHash) {
          signinMethods.push(PROVIDER_PASSWORD);
        }
        if (users[0].emailLinkSignin) {
          signinMethods.push(SIGNIN_METHOD_EMAIL_LINK);
        }
      }
    }
  }

  return {
    kind: "identitytoolkit#CreateAuthUriResponse",
    registered,
    allProviders,
    sessionId,
    signinMethods,
  };
}

const SESSION_COOKIE_MIN_VALID_DURATION = 5 * 60; /* 5 minutes in seconds */
export const SESSION_COOKIE_MAX_VALID_DURATION = 14 * 24 * 60 * 60; /* 14 days in seconds */

function createSessionCookie(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1CreateSessionCookieRequest"]
): Schemas["GoogleCloudIdentitytoolkitV1CreateSessionCookieResponse"] {
  assert(reqBody.idToken, "MISSING_ID_TOKEN");
  const validDuration = Number(reqBody.validDuration) || SESSION_COOKIE_MAX_VALID_DURATION;
  assert(
    validDuration >= SESSION_COOKIE_MIN_VALID_DURATION &&
      validDuration <= SESSION_COOKIE_MAX_VALID_DURATION,
    "INVALID_DURATION"
  );
  const { payload } = parseIdToken(state, reqBody.idToken);
  const issuedAt = toUnixTimestamp(new Date());
  const expiresAt = issuedAt + validDuration;
  const sessionCookie = signJwt(
    {
      ...payload,
      iat: issuedAt,
      exp: expiresAt,
      iss: `https://session.firebase.google.com/${payload.aud}`,
    },
    "fake-secret",
    {
      // Generate a unsigned (insecure) JWT. Admin SDKs should treat this like
      // a real token (if in emulator mode). This won't work in production.
      algorithm: "none",
    }
  );

  return { sessionCookie };
}

function deleteAccount(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1DeleteAccountRequest"],
  ctx: ExegesisContext
): Schemas["GoogleCloudIdentitytoolkitV1DeleteAccountResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  let user: UserInfo;
  if (ctx.security?.Oauth2) {
    assert(reqBody.localId, "MISSING_LOCAL_ID");
    const maybeUser = state.getUserByLocalId(reqBody.localId);
    assert(maybeUser, "USER_NOT_FOUND");
    user = maybeUser;
  } else {
    assert(reqBody.idToken, "MISSING_ID_TOKEN");
    user = parseIdToken(state, reqBody.idToken).user;
  }

  state.deleteUser(user);

  return {
    kind: "identitytoolkit#DeleteAccountResponse",
  };
}

function getProjects(
  state: ProjectState
): Schemas["GoogleCloudIdentitytoolkitV1GetProjectConfigResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(state instanceof AgentProjectState, "UNSUPPORTED_TENANT_OPERATION");
  return {
    projectId: state.projectNumber,
    authorizedDomains: [
      // This list is just a placeholder -- the JS SDK will NOT validate the
      // domain at all when connecting to the emulator. Google-internal context:
      // http://go/firebase-auth-emulator-dd#heading=h.3r9cilur7s46
      "localhost",
    ],
  };
}

function getRecaptchaParams(
  state: ProjectState
): Schemas["GoogleCloudIdentitytoolkitV1GetRecaptchaParamResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  return {
    kind: "identitytoolkit#GetRecaptchaParamResponse",

    // These strings have the same length and character set as real tokens/keys
    // but are clearly fake to human eyes. This should help troubleshooting
    // issues caused by sending these to the real Recaptcha service backend.
    // Clients, such as Firebase SDKs, MUST disable Recaptcha when communicating
    // with the emulator. DO NOT rely on / parse the exact values below.
    recaptchaStoken:
      "This-is-a-fake-token__Dont-send-this-to-the-Recaptcha-service__The-Auth-Emulator-does-not-support-Recaptcha",
    recaptchaSiteKey: "Fake-key__Do-not-send-this-to-Recaptcha_",
  };
}

function queryAccounts(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1QueryUserInfoRequest"]
): Schemas["GoogleCloudIdentitytoolkitV1QueryUserInfoResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  if (reqBody.expression?.length) {
    throw new NotImplementedError("expression is not implemented.");
  }

  // returnUserInfo is by default true. Take this branch only on an explicit false.
  if (reqBody.returnUserInfo === false) {
    return {
      recordsCount: state.getUserCount().toString(),
    };
  }

  // In production, limit has an upper bound of 500 (which is also the default).
  // https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/query
  // To simplify implementation of both the Auth Emulator and clients, we do not
  // support limit or offset. ALL users will be returned even if there are more
  // than 500 of them. This is a willful violation of the API contract above.
  if (reqBody.limit) {
    throw new NotImplementedError("limit is not implemented.");
  }

  reqBody.offset = reqBody.offset || "0";
  if (reqBody.offset !== "0") {
    throw new NotImplementedError("offset is not implemented.");
  }

  if (!reqBody.order || reqBody.order === "ORDER_UNSPECIFIED") {
    reqBody.order = "ASC";
  }

  if (!reqBody.sortBy || reqBody.sortBy === "SORT_BY_FIELD_UNSPECIFIED") {
    reqBody.sortBy = "USER_ID";
  }
  let sortByField: "localId";
  if (reqBody.sortBy === "USER_ID") {
    sortByField = "localId";
  } else {
    throw new NotImplementedError("Only sorting by USER_ID is implemented.");
  }

  const users = state.queryUsers({}, { order: reqBody.order, sortByField });

  return {
    recordsCount: users.length.toString(),
    userInfo: users,
  };
}

/**
 * Reset password for a user account.
 *
 * @param state the current project state
 * @param reqBody request with oobCode and passwords
 * @return the HTTP response body
 */
export function resetPassword(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1ResetPasswordRequest"]
): Schemas["GoogleCloudIdentitytoolkitV1ResetPasswordResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(state.allowPasswordSignup, "PASSWORD_LOGIN_DISABLED");
  assert(reqBody.oobCode, "MISSING_OOB_CODE");
  const oob = state.validateOobCode(reqBody.oobCode);
  assert(oob, "INVALID_OOB_CODE");

  if (reqBody.newPassword) {
    assert(oob.requestType === "PASSWORD_RESET", "INVALID_OOB_CODE");
    assert(
      reqBody.newPassword.length >= PASSWORD_MIN_LENGTH,
      `WEAK_PASSWORD : Password should be at least ${PASSWORD_MIN_LENGTH} characters`
    );
    state.deleteOobCode(reqBody.oobCode);
    let user = state.getUserByEmail(oob.email);
    assert(user, "INVALID_OOB_CODE");

    const salt = "fakeSalt" + randomId(20);
    const passwordHash = hashPassword(reqBody.newPassword, salt);
    user = state.updateUserByLocalId(
      user.localId,
      {
        emailVerified: true,
        passwordHash,
        salt,
        passwordUpdatedAt: Date.now(),
        validSince: toUnixTimestamp(new Date()).toString(),
      },
      { deleteProviders: user.providerUserInfo?.map((info) => info.providerId) }
    );
  }

  return {
    kind: "identitytoolkit#ResetPasswordResponse",
    requestType: oob.requestType,
    // Do not reveal the email when inspecting an email sign-in oobCode.
    // Instead, the client must provide email (e.g. by asking the user)
    // when they call the emailLinkSignIn endpoint.
    // See: https://firebase.google.com/docs/auth/web/email-link-auth#security_concerns
    email: oob.requestType === "EMAIL_SIGNIN" ? undefined : oob.email,
  };
}

function sendOobCode(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1GetOobCodeRequest"],
  ctx: ExegesisContext
): Schemas["GoogleCloudIdentitytoolkitV1GetOobCodeResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(
    reqBody.requestType && reqBody.requestType !== "OOB_REQ_TYPE_UNSPECIFIED",
    "MISSING_REQ_TYPE"
  );
  if (reqBody.returnOobLink) {
    assert(ctx.security?.Oauth2, "INSUFFICIENT_PERMISSION");
  }
  if (reqBody.continueUrl) {
    assert(
      parseAbsoluteUri(reqBody.continueUrl),
      "INVALID_CONTINUE_URI : ((expected an absolute URI with valid scheme and host))"
    );
  }

  let email: string;
  let mode: string;

  switch (reqBody.requestType) {
    case "EMAIL_SIGNIN":
      assert(state.enableEmailLinkSignin, "OPERATION_NOT_ALLOWED");
      mode = "signIn";
      assert(reqBody.email, "MISSING_EMAIL");
      email = canonicalizeEmailAddress(reqBody.email);
      break;
    case "PASSWORD_RESET":
      mode = "resetPassword";
      assert(reqBody.email, "MISSING_EMAIL");
      email = canonicalizeEmailAddress(reqBody.email);
      assert(state.getUserByEmail(email), "EMAIL_NOT_FOUND");
      break;
    case "VERIFY_EMAIL":
      mode = "verifyEmail";

      // Matching production behavior, reqBody.returnOobLink is used as a signal
      // for Admin usage (instead of whether request is OAuth 2 authenticated.)
      if (reqBody.returnOobLink && !reqBody.idToken) {
        assert(reqBody.email, "MISSING_EMAIL");
        email = canonicalizeEmailAddress(reqBody.email);
        const maybeUser = state.getUserByEmail(email);
        assert(maybeUser, "USER_NOT_FOUND");
      } else {
        // Get the user from idToken, reqBody.email is ignored.
        const user = parseIdToken(state, reqBody.idToken || "").user;
        assert(user.email, "MISSING_EMAIL");
        email = user.email;
      }
      break;

    default:
      throw new NotImplementedError(reqBody.requestType);
  }

  if (reqBody.canHandleCodeInApp) {
    EmulatorLogger.forEmulator(Emulators.AUTH).log(
      "WARN",
      "canHandleCodeInApp is unsupported in Auth Emulator. All OOB operations will complete via web."
    );
  }

  const url = authEmulatorUrl(ctx.req as express.Request);
  const oobRecord = createOobRecord(state, email, url, {
    requestType: reqBody.requestType,
    mode,
    continueUrl: reqBody.continueUrl,
  });

  if (reqBody.returnOobLink) {
    return {
      kind: "identitytoolkit#GetOobConfirmationCodeResponse",
      email,
      oobCode: oobRecord.oobCode,
      oobLink: oobRecord.oobLink,
    };
  } else {
    logOobMessage(oobRecord);

    return {
      kind: "identitytoolkit#GetOobConfirmationCodeResponse",
      email,
    };
  }
}

function sendVerificationCode(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SendVerificationCodeRequest"]
): Schemas["GoogleCloudIdentitytoolkitV1SendVerificationCodeResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(state instanceof AgentProjectState, "UNSUPPORTED_TENANT_OPERATION");
  // reqBody.iosReceipt, iosSecret, and recaptchaToken are intentionally ignored.

  // Production Firebase Auth service also throws INVALID_PHONE_NUMBER instead
  // of MISSING_XXXX when phoneNumber is missing. Matching the behavior here.
  assert(
    reqBody.phoneNumber && isValidPhoneNumber(reqBody.phoneNumber),
    "INVALID_PHONE_NUMBER : Invalid format."
  );

  const user = state.getUserByPhoneNumber(reqBody.phoneNumber);
  assert(
    !user?.mfaInfo?.length,
    "UNSUPPORTED_FIRST_FACTOR : A phone number cannot be set as a first factor on an SMS based MFA user."
  );

  const { sessionInfo, phoneNumber, code } = state.createVerificationCode(reqBody.phoneNumber);

  // Print out a developer-friendly log containing the link, in lieu of sending
  // a real text message out to the phone number.
  EmulatorLogger.forEmulator(Emulators.AUTH).log(
    "BULLET",
    `To verify the phone number ${phoneNumber}, use the code ${code}.`
  );

  return {
    sessionInfo,
  };
}

function setAccountInfo(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SetAccountInfoRequest"],
  ctx: ExegesisContext
): Schemas["GoogleCloudIdentitytoolkitV1SetAccountInfoResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  const url = authEmulatorUrl(ctx.req as express.Request);
  return setAccountInfoImpl(state, reqBody, {
    privileged: !!ctx.security?.Oauth2,
    emulatorUrl: url,
  });
}

/**
 * Updates an account based on localId, idToken, or oobCode.
 *
 * @param state the current project state
 * @param reqBody request with fields to update
 * @param privileged whether request is OAuth2 authenticated. Affects validation
 * @param emulatorUrl url to the auth emulator instance. Needed for sending OOB link for email reset
 * @return the HTTP response body
 */
export function setAccountInfoImpl(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SetAccountInfoRequest"],
  { privileged = false, emulatorUrl = undefined }: { privileged?: boolean; emulatorUrl?: URL } = {}
): Schemas["GoogleCloudIdentitytoolkitV1SetAccountInfoResponse"] {
  // TODO: Implement these.
  const unimplementedFields: (keyof typeof reqBody)[] = [
    "provider",
    "upgradeToFederatedLogin",
    "linkProviderUserInfo",
  ];
  for (const field of unimplementedFields) {
    if (field in reqBody) {
      throw new NotImplementedError(`${field} is not implemented yet.`);
    }
  }

  if (!privileged) {
    assert(
      reqBody.idToken || reqBody.oobCode,
      "INVALID_REQ_TYPE : Unsupported request parameters."
    );
    assert(reqBody.customAttributes == null, "INSUFFICIENT_PERMISSION");
  } else {
    assert(reqBody.localId, "MISSING_LOCAL_ID");
  }

  if (reqBody.customAttributes) {
    validateSerializedCustomClaims(reqBody.customAttributes);
  }

  reqBody.deleteAttribute = reqBody.deleteAttribute || [];
  for (const attr of reqBody.deleteAttribute) {
    if (attr === "PROVIDER" || attr === "RAW_USER_INFO") {
      throw new NotImplementedError(`deleteAttribute: ${attr}`);
    }
  }

  const updates: Omit<Partial<UserInfo>, "localId" | "providerUserInfo"> = {};
  let user: UserInfo;
  let signInProvider: string | undefined;
  let isEmailUpdate: boolean = false;

  if (reqBody.oobCode) {
    const oob = state.validateOobCode(reqBody.oobCode);
    assert(oob, "INVALID_OOB_CODE");
    switch (oob.requestType) {
      case "VERIFY_EMAIL": {
        state.deleteOobCode(reqBody.oobCode);
        signInProvider = PROVIDER_PASSWORD;
        const maybeUser = state.getUserByEmail(oob.email);
        assert(maybeUser, "INVALID_OOB_CODE");
        user = maybeUser;
        updates.emailVerified = true;
        if (oob.email !== user.email) {
          updates.email = oob.email;
        }
        break;
      }
      case "RECOVER_EMAIL": {
        state.deleteOobCode(reqBody.oobCode);
        const maybeUser = state.getUserByInitialEmail(oob.email);
        assert(maybeUser, "INVALID_OOB_CODE");
        // Assert that we don't have any user with this initialEmail
        assert(!state.getUserByEmail(oob.email), "EMAIL_EXISTS");
        user = maybeUser;
        if (oob.email !== user.email) {
          updates.email = oob.email;
          // Consider email verified, since this flow is initiated from the user's email
          updates.emailVerified = true;
        }
        break;
      }
      default:
        throw new NotImplementedError(oob.requestType);
    }
  } else {
    if (reqBody.idToken) {
      ({ user, signInProvider } = parseIdToken(state, reqBody.idToken));
      assert(reqBody.disableUser == null, "OPERATION_NOT_ALLOWED");
    } else {
      assert(reqBody.localId, "MISSING_LOCAL_ID");
      const maybeUser = state.getUserByLocalId(reqBody.localId);
      assert(maybeUser, "USER_NOT_FOUND");
      user = maybeUser;
    }

    if (reqBody.email) {
      assert(isValidEmailAddress(reqBody.email), "INVALID_EMAIL");

      const newEmail = canonicalizeEmailAddress(reqBody.email);
      if (newEmail !== user.email) {
        assert(!state.getUserByEmail(newEmail), "EMAIL_EXISTS");
        updates.email = newEmail;
        // TODO: Set verified if email is verified by IDP linked to account.
        updates.emailVerified = false;
        isEmailUpdate = true;
        // Only update initial email if the user is not anonymous and does not have an initial email.
        // We need to check for an anonymous user through the signIn provider, rather than relying
        // on an empty user.email field, because it is possible for an anonymous user to update their
        // email address through the SetAccountInfo endpoint.
        if (signInProvider !== PROVIDER_ANONYMOUS && user.email && !user.initialEmail) {
          updates.initialEmail = user.email;
        }
      }
    }
    if (reqBody.password) {
      assert(
        reqBody.password.length >= PASSWORD_MIN_LENGTH,
        `WEAK_PASSWORD : Password should be at least ${PASSWORD_MIN_LENGTH} characters`
      );
      updates.salt = "fakeSalt" + randomId(20);
      updates.passwordHash = hashPassword(reqBody.password, updates.salt);
      updates.passwordUpdatedAt = Date.now();
      signInProvider = PROVIDER_PASSWORD;
    }

    if (reqBody.password || reqBody.validSince || updates.email) {
      updates.validSince = toUnixTimestamp(new Date()).toString();
    }

    // if the request specifies an `mfa` key and enrollments are present and non-empty, set the enrollments
    // as the current MFA state for the user. if the `mfa` key is specified and no enrollments are present,
    // clear any existing MFA data for the user. if no `mfa` key is specified, MFA is left unchanged.
    if (reqBody.mfa) {
      if (reqBody.mfa.enrollments && reqBody.mfa.enrollments.length > 0) {
        updates.mfaInfo = getMfaEnrollmentsFromRequest(state, reqBody.mfa.enrollments);
      } else {
        updates.mfaInfo = undefined;
      }
    }

    // Copy profile properties to updates, if they're specified.
    const fieldsToCopy: (keyof typeof reqBody & keyof typeof updates)[] = [
      "displayName",
      "photoUrl",
    ];
    if (privileged) {
      if (reqBody.disableUser != null) {
        updates.disabled = reqBody.disableUser;
      }
      if (reqBody.phoneNumber && reqBody.phoneNumber !== user.phoneNumber) {
        assert(isValidPhoneNumber(reqBody.phoneNumber), "INVALID_PHONE_NUMBER : Invalid format.");
        assert(!state.getUserByPhoneNumber(reqBody.phoneNumber), "PHONE_NUMBER_EXISTS");
        updates.phoneNumber = reqBody.phoneNumber;
      }
      fieldsToCopy.push(
        "emailVerified",
        "customAttributes",
        "createdAt",
        "lastLoginAt",
        "validSince"
      );
    }
    for (const field of fieldsToCopy) {
      if (reqBody[field] != null) {
        mirrorFieldTo(updates, field, reqBody);
      }
    }

    for (const attr of reqBody.deleteAttribute) {
      switch (attr) {
        case "USER_ATTRIBUTE_NAME_UNSPECIFIED":
          continue;
        case "DISPLAY_NAME":
          updates.displayName = undefined;
          break;
        case "PHOTO_URL":
          updates.photoUrl = undefined;
          break;
        case "PASSWORD":
          updates.passwordHash = undefined;
          updates.salt = undefined;
          break;
        case "EMAIL":
          updates.email = undefined;
          updates.emailVerified = undefined;
          updates.emailLinkSignin = undefined;
          break;
      }
    }

    if (reqBody.deleteProvider?.includes(PROVIDER_PASSWORD)) {
      updates.email = undefined;
      updates.emailVerified = undefined;
      updates.emailLinkSignin = undefined;
      updates.passwordHash = undefined;
      updates.salt = undefined;
    }
    if (reqBody.deleteProvider?.includes(PROVIDER_PHONE)) {
      updates.phoneNumber = undefined;
    }
  }

  user = state.updateUserByLocalId(user.localId, updates, {
    deleteProviders: reqBody.deleteProvider,
  });

  // Only initiate the recover email OOB flow for non-anonymous users
  if (signInProvider !== PROVIDER_ANONYMOUS && user.initialEmail && isEmailUpdate) {
    if (!emulatorUrl) {
      throw new Error("Internal assertion error: missing emulatorUrl param");
    }
    sendOobForEmailReset(state, user.initialEmail, emulatorUrl);
  }

  return redactPasswordHash({
    kind: "identitytoolkit#SetAccountInfoResponse",
    localId: user.localId,
    emailVerified: user.emailVerified,
    providerUserInfo: user.providerUserInfo,

    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    passwordHash: user.passwordHash,

    ...(updates.validSince && signInProvider ? issueTokens(state, user, signInProvider) : {}),
  });
}

function sendOobForEmailReset(state: ProjectState, initialEmail: string, url: URL): void {
  const oobRecord = createOobRecord(state, initialEmail, url, {
    requestType: "RECOVER_EMAIL",
    mode: "recoverEmail",
  });

  // Print out a developer-friendly log
  logOobMessage(oobRecord);
}

function createOobRecord(
  state: ProjectState,
  email: string,
  url: URL,
  params: {
    requestType: OobRequestType;
    mode: string;
    continueUrl?: string;
  }
): OobRecord {
  const oobRecord = state.createOob(email, params.requestType, (oobCode) => {
    url.pathname = "/emulator/action";
    url.searchParams.set("mode", params.mode);
    url.searchParams.set("lang", "en");
    url.searchParams.set("oobCode", oobCode);
    // TODO: Support custom handler links.

    // This doesn't matter for now, since any API key works for defaultProject.
    // TODO: What if reqBody.targetProjectId is set?
    url.searchParams.set("apiKey", "fake-api-key");

    if (params.continueUrl) {
      url.searchParams.set("continueUrl", params.continueUrl);
    }

    if (state instanceof TenantProjectState) {
      url.searchParams.set("tenantId", state.tenantId);
    }

    return url.toString();
  });

  return oobRecord;
}

function logOobMessage(oobRecord: OobRecord) {
  const oobLink = oobRecord.oobLink;
  const email = oobRecord.email;

  // Generate a developer-friendly log containing the link, in lieu of
  // sending a real email out to the email address.
  let maybeMessage: string | undefined;
  switch (oobRecord.requestType) {
    case "EMAIL_SIGNIN":
      maybeMessage = `To sign in as ${email}, follow this link: ${oobLink}`;
      break;
    case "PASSWORD_RESET":
      maybeMessage = `To reset the password for ${email}, follow this link: ${oobLink}&newPassword=NEW_PASSWORD_HERE`;
      break;
    case "VERIFY_EMAIL":
      maybeMessage = `To verify the email address ${email}, follow this link: ${oobLink}`;
      break;
    case "RECOVER_EMAIL":
      maybeMessage = `To reset your email address to ${email}, follow this link: ${oobLink}`;
      break;
  }

  if (maybeMessage) {
    EmulatorLogger.forEmulator(Emulators.AUTH).log("BULLET", maybeMessage);
  }
}

function signInWithCustomToken(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SignInWithCustomTokenRequest"]
): Schemas["GoogleCloudIdentitytoolkitV1SignInWithCustomTokenResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(reqBody.token, "MISSING_CUSTOM_TOKEN");

  let payload: {
    aud?: unknown;
    uid?: unknown;
    user_id?: unknown;
    claims?: unknown;
    tenant_id?: unknown;
  };
  if (reqBody.token.startsWith("{")) {
    // In the emulator only, we allow plain JSON strings as custom tokens, to
    // simplify testing. This won't work in production.
    try {
      payload = JSON.parse(reqBody.token);
    } catch {
      throw new BadRequestError(
        "INVALID_CUSTOM_TOKEN : ((Auth Emulator only accepts strict JSON or JWTs as fake custom tokens.))"
      );
    }
    // Don't check payload.aud for JSON strings, making them easier to construct.
  } else {
    const decoded = decodeJwt(reqBody.token, { complete: true }) as {
      header: JwtHeader;
      payload: typeof payload;
    } | null;
    if (state instanceof TenantProjectState) {
      assert(decoded?.payload.tenant_id === state.tenantId, "TENANT_ID_MISMATCH");
    }
    assert(decoded, "INVALID_CUSTOM_TOKEN : Invalid assertion format");
    if (decoded.header.alg !== "none") {
      // We may have received a real token, signed using a service account private
      // key, intended for exchange with production Authentication service.
      // As an emulator, we do not have the private key and we will assume it is
      // valid with a warning.
      EmulatorLogger.forEmulator(Emulators.AUTH).log(
        "WARN",
        "Received a signed custom token. Auth Emulator does not validate JWTs and IS NOT SECURE"
      );
    }
    assert(
      decoded.payload.aud === CUSTOM_TOKEN_AUDIENCE,
      `INVALID_CUSTOM_TOKEN : ((Invalid aud (audience): ${decoded.payload.aud} ` +
        "Note: Firebase ID Tokens / third-party tokens cannot be used with signInWithCustomToken.))"
    );
    // We do not verify iss or sub since these are service account emails that
    // we cannot reasonably validate within the emulator.
    // iat (issued at) and exp (expires at) are intentionally unchecked so that
    // developers can keep reusing the same token in their tests.
    payload = decoded.payload;
  }
  const localId = coercePrimitiveToString(payload.uid) ?? coercePrimitiveToString(payload.user_id);
  assert(localId, "MISSING_IDENTIFIER");

  let extraClaims: Record<string, unknown> = {};
  if ("claims" in payload) {
    validateCustomClaims(payload.claims);
    extraClaims = payload.claims;
  }

  let user = state.getUserByLocalId(localId);
  const isNewUser = !user;

  const timestamp = new Date();
  const updates: Partial<UserInfo> = {
    customAuth: true,
    lastLoginAt: timestamp.getTime().toString(),
    tenantId: state instanceof TenantProjectState ? state.tenantId : undefined,
  };

  if (user) {
    assert(!user.disabled, "USER_DISABLED");
    user = state.updateUserByLocalId(localId, updates);
  } else {
    updates.createdAt = timestamp.getTime().toString();
    user = state.createUserWithLocalId(localId, updates);
    if (!user) {
      throw new Error(`Internal assertion error: trying to create duplicate localId: ${localId}`);
    }
  }

  return {
    kind: "identitytoolkit#VerifyCustomTokenResponse",
    isNewUser,
    ...issueTokens(state, user, PROVIDER_CUSTOM, { extraClaims }),
  };
}

async function signInWithEmailLink(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SignInWithEmailLinkRequest"]
): Promise<Schemas["GoogleCloudIdentitytoolkitV1SignInWithEmailLinkResponse"]> {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(state.enableEmailLinkSignin, "OPERATION_NOT_ALLOWED");
  const userFromIdToken = reqBody.idToken ? parseIdToken(state, reqBody.idToken).user : undefined;
  assert(reqBody.email, "MISSING_EMAIL");
  const email = canonicalizeEmailAddress(reqBody.email);
  assert(reqBody.oobCode, "MISSING_OOB_CODE");
  const oob = state.validateOobCode(reqBody.oobCode);
  assert(oob && oob.requestType === "EMAIL_SIGNIN", "INVALID_OOB_CODE");
  assert(
    email === oob.email,
    "INVALID_EMAIL : The email provided does not match the sign-in email address."
  );
  state.deleteOobCode(reqBody.oobCode);

  const userFromEmail = state.getUserByEmail(email);
  let user = userFromIdToken || userFromEmail;
  const isNewUser = !user;

  const timestamp = new Date();
  let updates: Omit<Partial<UserInfo>, "localId" | "providerUserInfo"> = {
    email,
    emailVerified: true,
    emailLinkSignin: true,
  };

  if (state instanceof TenantProjectState) {
    updates.tenantId = state.tenantId;
  }

  let extraClaims;
  if (!user) {
    updates.createdAt = timestamp.getTime().toString();
    const localId = state.generateLocalId();
    const userBeforeCreate = { localId, ...updates };
    const blockingResponse = await fetchBlockingFunction(
      state,
      BlockingFunctionEvents.BEFORE_CREATE,
      userBeforeCreate,
      { signInMethod: "emailLink" }
    );

    updates = { ...updates, ...blockingResponse.updates };
    user = state.createUserWithLocalId(localId, updates)!;

    if (!user.disabled && !isMfaEnabled(state, user)) {
      const blockingResponse = await fetchBlockingFunction(
        state,
        BlockingFunctionEvents.BEFORE_SIGN_IN,
        user,
        { signInMethod: "emailLink" }
      );
      updates = blockingResponse.updates;
      extraClaims = blockingResponse.extraClaims;
      user = state.updateUserByLocalId(user.localId, updates);
    }
  } else {
    assert(!user.disabled, "USER_DISABLED");
    if (userFromIdToken && userFromEmail) {
      assert(userFromIdToken.localId === userFromEmail.localId, "EMAIL_EXISTS");
    }

    if (!user.disabled && !isMfaEnabled(state, user)) {
      const blockingResponse = await fetchBlockingFunction(
        state,
        BlockingFunctionEvents.BEFORE_SIGN_IN,
        { ...user, ...updates },
        { signInMethod: "emailLink" }
      );
      updates = { ...updates, ...blockingResponse.updates };
      extraClaims = blockingResponse.extraClaims;
    }

    user = state.updateUserByLocalId(user.localId, updates);
  }

  const response = {
    kind: "identitytoolkit#EmailLinkSigninResponse",
    email,
    localId: user.localId,
    isNewUser,
  };

  // User may have been disabled but only throw after writing user to store
  assert(!user.disabled, "USER_DISABLED");

  if (isMfaEnabled(state, user)) {
    return { ...response, ...mfaPending(state, user, PROVIDER_PASSWORD) };
  } else {
    user = state.updateUserByLocalId(user.localId, { lastLoginAt: Date.now().toString() });
    return { ...response, ...issueTokens(state, user, PROVIDER_PASSWORD, { extraClaims }) };
  }
}

type SignInWithIdpResponse = Schemas["GoogleCloudIdentitytoolkitV1SignInWithIdpResponse"];

async function signInWithIdp(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SignInWithIdpRequest"]
): Promise<SignInWithIdpResponse> {
  assert(!state.disableAuth, "PROJECT_DISABLED");

  if (reqBody.returnRefreshToken) {
    throw new NotImplementedError("returnRefreshToken is not implemented yet.");
  }
  if (reqBody.pendingIdToken) {
    throw new NotImplementedError("pendingIdToken is not implemented yet.");
  }

  const normalizedUri = getNormalizedUri(reqBody);
  const providerId = normalizedUri.searchParams.get("providerId")?.toLowerCase();
  assert(
    providerId,
    `INVALID_CREDENTIAL_OR_PROVIDER_ID : Invalid IdP response/credential: ${normalizedUri.toString()}`
  );
  const oauthIdToken = normalizedUri.searchParams.get("id_token") || undefined;
  const oauthAccessToken = normalizedUri.searchParams.get("access_token") || undefined;

  const claims = parseClaims(oauthIdToken) || parseClaims(oauthAccessToken);
  if (!claims) {
    // Try to give the most helpful error message, depending on input.
    if (oauthIdToken) {
      throw new BadRequestError(
        `INVALID_IDP_RESPONSE : Unable to parse id_token: ${oauthIdToken} ((Auth Emulator only accepts strict JSON or JWTs as fake id_tokens.))`
      );
    } else if (oauthAccessToken) {
      if (providerId === "google.com" || providerId === "apple.com") {
        throw new NotImplementedError(
          `The Auth Emulator only support sign-in with ${providerId} using id_token, not access_token. Please update your code to use id_token.`
        );
      } else {
        throw new NotImplementedError(
          `The Auth Emulator does not support ${providerId} sign-in with credentials.`
        );
      }
    } else {
      throw new NotImplementedError(
        "The Auth Emulator only supports sign-in with credentials (id_token required)."
      );
    }
  }

  // Generic SAML flow
  let samlResponse: SamlResponse | undefined;
  let signInAttributes = undefined;
  if (normalizedUri.searchParams.get("SAMLResponse")) {
    // Auth emulator purposefully does not parse SAML and expects SAML-related
    // fields to be JSON objects.
    samlResponse = JSON.parse(normalizedUri.searchParams.get("SAMLResponse")!) as SamlResponse;
    signInAttributes = samlResponse.assertion?.attributeStatements;

    assert(samlResponse.assertion, "INVALID_IDP_RESPONSE ((Missing assertion in SAMLResponse.))");
    assert(
      samlResponse.assertion.subject,
      "INVALID_IDP_RESPONSE ((Missing assertion.subject in SAMLResponse.))"
    );
    assert(
      samlResponse.assertion.subject.nameId,
      "INVALID_IDP_RESPONSE ((Missing assertion.subject.nameId in SAMLResponse.))"
    );
  }

  let { response, rawId } = fakeFetchUserInfoFromIdp(providerId, claims, samlResponse);

  // Always return an access token, so that clients depending on it sorta work.
  // e.g. JS SDK creates credentials from accessTokens for most providers:
  // https://github.com/firebase/firebase-js-sdk/blob/6d640284ef6fd228bd7defdcb2d85a9f88239ad8/packages/auth/src/authcredential.js#L1515
  response.oauthAccessToken =
    oauthAccessToken || `FirebaseAuthEmulatorFakeAccessToken_${providerId}`;
  response.oauthIdToken = oauthIdToken;
  // What about response.refreshToken?

  const userFromIdToken = reqBody.idToken ? parseIdToken(state, reqBody.idToken).user : undefined;
  const userMatchingProvider = state.getUserByProviderRawId(providerId, rawId);

  let accountUpdates: AccountUpdates;
  try {
    if (userFromIdToken) {
      assert(!userMatchingProvider, "FEDERATED_USER_ID_ALREADY_LINKED");
      ({ accountUpdates, response } = handleLinkIdp(state, response, userFromIdToken));
    } else if (state.oneAccountPerEmail) {
      const userMatchingEmail = response.email ? state.getUserByEmail(response.email) : undefined;
      ({ accountUpdates, response } = handleIdpSigninEmailRequired(
        response,
        rawId,
        userMatchingProvider,
        userMatchingEmail
      ));
    } else {
      ({ accountUpdates, response } = handleIdpSigninEmailNotRequired(
        response,
        userMatchingProvider
      ));
    }
  } catch (err: any) {
    if (reqBody.returnIdpCredential && err instanceof BadRequestError) {
      response.errorMessage = err.message;
      return response;
    } else {
      throw err;
    }
  }

  if (response.needConfirmation) {
    return response;
  }

  const providerUserInfo: ProviderUserInfo = {
    providerId,
    rawId,
    // For some reason, production API responses sets federatedId to be same as
    // rawId, instead of the prefixed ID. TODO: Create internal bug?
    federatedId: rawId,
    displayName: response.displayName,
    photoUrl: response.photoUrl,
    email: response.email,
    screenName: response.screenName,
  };

  let user: UserInfo;
  let extraClaims;
  const oauthTokens = {
    oauthIdToken: response.oauthIdToken,
    oauthAccessToken: response.oauthAccessToken,

    // The below are not set by our fake IdP fetch currently
    oauthRefreshToken: response.oauthRefreshToken,
    oauthTokenSecret: response.oauthTokenSecret,
    oauthExpiresIn: coercePrimitiveToString(response.oauthExpireIn),
  };
  if (response.isNewUser) {
    const timestamp = new Date();
    let updates: Partial<UserInfo> = {
      ...accountUpdates.fields,
      createdAt: timestamp.getTime().toString(),
      lastLoginAt: timestamp.getTime().toString(),
      providerUserInfo: [providerUserInfo],
      tenantId: state instanceof TenantProjectState ? state.tenantId : undefined,
    };
    const localId = state.generateLocalId();
    const userBeforeCreate = { localId, ...updates };
    const blockingResponse = await fetchBlockingFunction(
      state,
      BlockingFunctionEvents.BEFORE_CREATE,
      userBeforeCreate,
      {
        signInMethod: response.providerId,
        rawUserInfo: response.rawUserInfo,
        signInAttributes: JSON.stringify(signInAttributes),
      },
      oauthTokens
    );

    updates = { ...updates, ...blockingResponse.updates };
    user = state.createUserWithLocalId(localId, updates)!;
    response.localId = user.localId;

    if (!user.disabled && !isMfaEnabled(state, user)) {
      const blockingResponse = await fetchBlockingFunction(
        state,
        BlockingFunctionEvents.BEFORE_SIGN_IN,
        user,
        {
          signInMethod: response.providerId,
          rawUserInfo: response.rawUserInfo,
          signInAttributes: JSON.stringify(signInAttributes),
        },
        oauthTokens
      );
      updates = blockingResponse.updates;
      extraClaims = blockingResponse.extraClaims;
      user = state.updateUserByLocalId(user.localId, updates);
    }
  } else {
    if (!response.localId) {
      throw new Error("Internal assertion error: localId not set for exising user.");
    }

    const maybeUser = state.getUserByLocalId(response.localId);
    assert(maybeUser, "USER_NOT_FOUND");
    user = maybeUser;

    let updates = { ...accountUpdates.fields };

    if (!user.disabled && !isMfaEnabled(state, user)) {
      const blockingResponse = await fetchBlockingFunction(
        state,
        BlockingFunctionEvents.BEFORE_SIGN_IN,
        { ...user, ...updates },
        {
          signInMethod: response.providerId,
          rawUserInfo: response.rawUserInfo,
          signInAttributes: JSON.stringify(signInAttributes),
        },
        oauthTokens
      );
      extraClaims = blockingResponse.extraClaims;
      updates = { ...updates, ...blockingResponse.updates };
    }

    user = state.updateUserByLocalId(response.localId, updates, {
      upsertProviders: [providerUserInfo],
    });
  }

  if (user.email === response.email) {
    response.emailVerified = user.emailVerified;
  }

  if (state instanceof TenantProjectState) {
    response.tenantId = state.tenantId;
  }

  if (isMfaEnabled(state, user)) {
    return { ...response, ...mfaPending(state, user, providerId) };
  } else {
    user = state.updateUserByLocalId(user.localId, { lastLoginAt: Date.now().toString() });
    // User may have been disabled after either blocking function, but
    // only throw after writing user to store
    assert(!user?.disabled, "USER_DISABLED");
    return {
      ...response,
      ...issueTokens(state, user, providerId, { signInAttributes, extraClaims }),
    };
  }
}

async function signInWithPassword(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SignInWithPasswordRequest"]
): Promise<Schemas["GoogleCloudIdentitytoolkitV1SignInWithPasswordResponse"]> {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(state.allowPasswordSignup, "PASSWORD_LOGIN_DISABLED");
  assert(reqBody.email !== undefined, "MISSING_EMAIL");
  assert(isValidEmailAddress(reqBody.email), "INVALID_EMAIL");
  assert(reqBody.password, "MISSING_PASSWORD");
  if (reqBody.captchaResponse || reqBody.captchaChallenge) {
    throw new NotImplementedError("captcha unimplemented");
  }
  if (reqBody.idToken || reqBody.pendingIdToken) {
    throw new NotImplementedError(
      "idToken / pendingIdToken is no longer in use and unsupported by the Auth Emulator."
    );
  }

  const email = canonicalizeEmailAddress(reqBody.email);
  let user = state.getUserByEmail(email);
  assert(user, "EMAIL_NOT_FOUND");
  assert(!user.disabled, "USER_DISABLED");
  assert(user.passwordHash && user.salt, "INVALID_PASSWORD");
  assert(user.passwordHash === hashPassword(reqBody.password, user.salt), "INVALID_PASSWORD");

  const response = {
    kind: "identitytoolkit#VerifyPasswordResponse",
    registered: true,
    localId: user.localId,
    email,
  };

  if (isMfaEnabled(state, user)) {
    return { ...response, ...mfaPending(state, user, PROVIDER_PASSWORD) };
  } else {
    const { updates, extraClaims } = await fetchBlockingFunction(
      state,
      BlockingFunctionEvents.BEFORE_SIGN_IN,
      user,
      { signInMethod: "password" }
    );
    user = state.updateUserByLocalId(user.localId, {
      ...updates,
      lastLoginAt: Date.now().toString(),
    });
    // User may have been disabled after blocking function, but only throw after
    // writing user to store
    assert(!user.disabled, "USER_DISABLED");
    return { ...response, ...issueTokens(state, user, PROVIDER_PASSWORD, { extraClaims }) };
  }
}

async function signInWithPhoneNumber(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV1SignInWithPhoneNumberRequest"]
): Promise<Schemas["GoogleCloudIdentitytoolkitV1SignInWithPhoneNumberResponse"]> {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(state instanceof AgentProjectState, "UNSUPPORTED_TENANT_OPERATION");
  let phoneNumber: string;
  if (reqBody.temporaryProof) {
    assert(reqBody.phoneNumber, "MISSING_PHONE_NUMBER");
    const proof = state.validateTemporaryProof(reqBody.temporaryProof, reqBody.phoneNumber);
    assert(proof, "INVALID_TEMPORARY_PROOF");
    ({ phoneNumber } = proof);
  } else {
    assert(reqBody.sessionInfo, "MISSING_SESSION_INFO");
    assert(reqBody.code, "MISSING_CODE");

    phoneNumber = verifyPhoneNumber(state, reqBody.sessionInfo, reqBody.code);
  }

  const userFromPhoneNumber = state.getUserByPhoneNumber(phoneNumber);
  const userFromIdToken = reqBody.idToken ? parseIdToken(state, reqBody.idToken).user : undefined;
  if (userFromPhoneNumber && userFromIdToken) {
    if (userFromPhoneNumber.localId !== userFromIdToken.localId) {
      assert(!reqBody.temporaryProof, "PHONE_NUMBER_EXISTS");
      // By now, the verification has succeeded, but we cannot proceed since
      // the phone number is linked to a different account. If a sessionInfo
      // is consumed, a temporaryProof should be returned with 200.
      return {
        ...state.createTemporaryProof(phoneNumber),
      };
    }
  }

  let user = userFromIdToken || userFromPhoneNumber;
  const isNewUser = !user;

  const timestamp = new Date();
  let updates: Partial<UserInfo> = {
    phoneNumber,
    lastLoginAt: timestamp.getTime().toString(),
  };

  let extraClaims;
  if (!user) {
    updates.createdAt = timestamp.getTime().toString();
    const localId = state.generateLocalId();
    const userBeforeCreate = { localId, ...updates };
    const blockingResponse = await fetchBlockingFunction(
      state,
      BlockingFunctionEvents.BEFORE_CREATE,
      userBeforeCreate,
      { signInMethod: "phone" }
    );

    updates = { ...updates, ...blockingResponse.updates };
    user = state.createUserWithLocalId(localId, updates)!;

    if (!user.disabled) {
      const blockingResponse = await fetchBlockingFunction(
        state,
        BlockingFunctionEvents.BEFORE_SIGN_IN,
        user,
        { signInMethod: "phone" }
      );
      updates = blockingResponse.updates;
      extraClaims = blockingResponse.extraClaims;
      user = state.updateUserByLocalId(user.localId, updates);
    }
  } else {
    assert(!user.disabled, "USER_DISABLED");
    assert(
      !user.mfaInfo?.length,
      "UNSUPPORTED_FIRST_FACTOR : A phone number cannot be set as a first factor on an SMS based MFA user."
    );

    if (!user.disabled) {
      const blockingResponse = await fetchBlockingFunction(
        state,
        BlockingFunctionEvents.BEFORE_SIGN_IN,
        { ...user, ...updates },
        { signInMethod: "phone" }
      );
      updates = { ...updates, ...blockingResponse.updates };
      extraClaims = blockingResponse.extraClaims;
    }

    user = state.updateUserByLocalId(user.localId, updates);
  }

  // User may have been disabled after either blocking function, but
  // only throw after writing user to store
  assert(!user?.disabled, "USER_DISABLED");

  const tokens = issueTokens(state, user, PROVIDER_PHONE, {
    extraClaims,
  });

  return {
    isNewUser,
    phoneNumber,
    localId: user.localId,

    ...tokens,
  };
}

function grantToken(
  state: ProjectState,
  reqBody: Schemas["GrantTokenRequest"]
): Schemas["GrantTokenResponse"] {
  // https://developers.google.com/identity/toolkit/reference/securetoken/rest/v1/token
  // reqBody.code is intentionally ignored.
  assert(reqBody.grantType, "MISSING_GRANT_TYPE");
  assert(reqBody.grantType === "refresh_token", "INVALID_GRANT_TYPE");
  assert(reqBody.refreshToken, "MISSING_REFRESH_TOKEN");

  const refreshTokenRecord = state.validateRefreshToken(reqBody.refreshToken);
  assert(!refreshTokenRecord.user.disabled, "USER_DISABLED");
  const tokens = issueTokens(state, refreshTokenRecord.user, refreshTokenRecord.provider, {
    extraClaims: refreshTokenRecord.extraClaims,
    secondFactor: refreshTokenRecord.secondFactor,
  });
  return {
    id_token: tokens.idToken,
    access_token: tokens.idToken,
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    token_type: "Bearer",
    user_id: refreshTokenRecord.user.localId,

    // According to API docs (and production behavior), this should be the
    // automatically generated number, not the customizable alphanumeric ID.
    project_id: state.projectNumber,
  };
}

function deleteAllAccountsInProject(state: ProjectState): {} {
  state.deleteAllAccounts();
  return {};
}

function getEmulatorProjectConfig(state: ProjectState): Schemas["EmulatorV1ProjectsConfig"] {
  return {
    signIn: {
      allowDuplicateEmails: !state.oneAccountPerEmail,
    },
  };
}

function updateEmulatorProjectConfig(
  state: ProjectState,
  reqBody: Schemas["EmulatorV1ProjectsConfig"],
  ctx: ExegesisContext
): Schemas["EmulatorV1ProjectsConfig"] {
  // New developers should not use updateEmulatorProjectConfig to update the
  // allowDuplicateEmails setting and should instead use updateConfig to do so.
  const updateMask = [];
  if (reqBody.signIn?.allowDuplicateEmails != null) {
    updateMask.push("signIn.allowDuplicateEmails");
  }
  ctx.params.query.updateMask = updateMask.join();

  updateConfig(state, reqBody, ctx);
  return getEmulatorProjectConfig(state);
}

function listOobCodesInProject(state: ProjectState): Schemas["EmulatorV1ProjectsOobCodes"] {
  return {
    oobCodes: [...state.listOobCodes()],
  };
}

function listVerificationCodesInProject(
  state: ProjectState
): Schemas["EmulatorV1ProjectsVerificationCodes"] {
  return {
    verificationCodes: [...state.listVerificationCodes()],
  };
}

function mfaEnrollmentStart(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV2StartMfaEnrollmentRequest"]
): Schemas["GoogleCloudIdentitytoolkitV2StartMfaEnrollmentResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(
    (state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
      state.mfaConfig.enabledProviders?.includes("PHONE_SMS"),
    "OPERATION_NOT_ALLOWED : SMS based MFA not enabled."
  );
  assert(reqBody.idToken, "MISSING_ID_TOKEN");

  const { user, signInProvider } = parseIdToken(state, reqBody.idToken);
  assert(
    !MFA_INELIGIBLE_PROVIDER.has(signInProvider),
    "UNSUPPORTED_FIRST_FACTOR : MFA is not available for the given first factor."
  );
  assert(
    user.emailVerified,
    "UNVERIFIED_EMAIL : Need to verify email first before enrolling second factors."
  );

  assert(reqBody.phoneEnrollmentInfo, "INVALID_ARGUMENT : ((Missing phoneEnrollmentInfo.))");
  // recaptchaToken, safetyNetToken, iosReceipt, and iosSecret are intentionally
  // ignored because the emulator doesn't implement anti-abuse features.
  // autoRetrievalInfo is ignored because SMS will not actually be sent.

  const phoneNumber = reqBody.phoneEnrollmentInfo.phoneNumber;

  // Production Firebase Auth service also throws INVALID_PHONE_NUMBER instead
  // of MISSING_XXXX when phoneNumber is missing. Matching the behavior here.
  assert(phoneNumber && isValidPhoneNumber(phoneNumber), "INVALID_PHONE_NUMBER : Invalid format.");
  assert(
    !user.mfaInfo?.some((enrollment) => enrollment.unobfuscatedPhoneInfo === phoneNumber),
    "SECOND_FACTOR_EXISTS : Phone number already enrolled as second factor for this account."
  );

  const { sessionInfo, code } = state.createVerificationCode(phoneNumber);

  // Print out a developer-friendly log containing the link, in lieu of sending
  // a real text message out to the phone number.
  EmulatorLogger.forEmulator(Emulators.AUTH).log(
    "BULLET",
    `To enroll MFA with ${phoneNumber}, use the code ${code}.`
  );

  return {
    phoneSessionInfo: {
      sessionInfo,
    },
  };
}

function mfaEnrollmentFinalize(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV2FinalizeMfaEnrollmentRequest"]
): Schemas["GoogleCloudIdentitytoolkitV2FinalizeMfaEnrollmentResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(
    (state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
      state.mfaConfig.enabledProviders?.includes("PHONE_SMS"),
    "OPERATION_NOT_ALLOWED : SMS based MFA not enabled."
  );
  assert(reqBody.idToken, "MISSING_ID_TOKEN");
  let { user, signInProvider } = parseIdToken(state, reqBody.idToken);
  assert(
    !MFA_INELIGIBLE_PROVIDER.has(signInProvider),
    "UNSUPPORTED_FIRST_FACTOR : MFA is not available for the given first factor."
  );
  assert(reqBody.phoneVerificationInfo, "INVALID_ARGUMENT : ((Missing phoneVerificationInfo.))");

  if (reqBody.phoneVerificationInfo.androidVerificationProof) {
    throw new NotImplementedError("androidVerificationProof is unsupported!");
  }
  const { code, sessionInfo } = reqBody.phoneVerificationInfo;

  assert(code, "MISSING_CODE");
  assert(sessionInfo, "MISSING_SESSION_INFO");

  const phoneNumber = verifyPhoneNumber(state, sessionInfo, code);
  assert(
    !user.mfaInfo?.some((enrollment) => enrollment.unobfuscatedPhoneInfo === phoneNumber),
    "SECOND_FACTOR_EXISTS : Phone number already enrolled as second factor for this account."
  );

  const existingFactors = user.mfaInfo || [];
  const existingIds = new Set<string>();
  for (const { mfaEnrollmentId } of existingFactors) {
    if (mfaEnrollmentId) {
      existingIds.add(mfaEnrollmentId);
    }
  }
  const enrollment = {
    displayName: reqBody.displayName,
    enrolledAt: new Date().toISOString(),
    mfaEnrollmentId: newRandomId(28, existingIds),
    phoneInfo: phoneNumber,
    unobfuscatedPhoneInfo: phoneNumber,
  };
  user = state.updateUserByLocalId(user.localId, {
    mfaInfo: [...existingFactors, enrollment],
  });

  // TODO: Generate OOB code for reverting enrollment.

  const { idToken, refreshToken } = issueTokens(state, user, signInProvider, {
    secondFactor: { identifier: enrollment.mfaEnrollmentId, provider: PROVIDER_PHONE },
  });

  return {
    idToken,
    refreshToken,
  };
}

function mfaEnrollmentWithdraw(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV2WithdrawMfaRequest"]
): Schemas["GoogleCloudIdentitytoolkitV2WithdrawMfaResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(reqBody.idToken, "MISSING_ID_TOKEN");

  let { user, signInProvider } = parseIdToken(state, reqBody.idToken);
  assert(user.mfaInfo, "MFA_ENROLLMENT_NOT_FOUND");

  const updatedList = user.mfaInfo.filter(
    (enrollment) => enrollment.mfaEnrollmentId !== reqBody.mfaEnrollmentId
  );
  assert(updatedList.length < user.mfaInfo.length, "MFA_ENROLLMENT_NOT_FOUND");

  user = state.updateUserByLocalId(user.localId, { mfaInfo: updatedList });

  return {
    ...issueTokens(state, user, signInProvider),
  };
}

function mfaSignInStart(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV2StartMfaSignInRequest"]
): Schemas["GoogleCloudIdentitytoolkitV2StartMfaSignInResponse"] {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(
    (state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
      state.mfaConfig.enabledProviders?.includes("PHONE_SMS"),
    "OPERATION_NOT_ALLOWED : SMS based MFA not enabled."
  );
  assert(
    reqBody.mfaPendingCredential,
    "MISSING_MFA_PENDING_CREDENTIAL : Request does not have MFA pending credential."
  );
  assert(
    reqBody.mfaEnrollmentId,
    "MISSING_MFA_ENROLLMENT_ID : No second factor identifier is provided."
  );
  // In production, reqBody.phoneSignInInfo must be set to indicate phone-based
  // MFA. However, we don't enforce this because none of its fields are required
  // in the emulator. e.g. recaptchaToken/safetyNetToken doesn't make sense;
  const { user } = parsePendingCredential(state, reqBody.mfaPendingCredential);

  const enrollment = user.mfaInfo?.find(
    (factor) => factor.mfaEnrollmentId === reqBody.mfaEnrollmentId
  );
  assert(enrollment, "MFA_ENROLLMENT_NOT_FOUND");
  const phoneNumber = enrollment.unobfuscatedPhoneInfo;
  assert(phoneNumber, "INVALID_ARGUMENT : MFA provider not supported!");

  const { sessionInfo, code } = state.createVerificationCode(phoneNumber);

  // Print out a developer-friendly log containing the link, in lieu of sending
  // a real text message out to the phone number.
  EmulatorLogger.forEmulator(Emulators.AUTH).log(
    "BULLET",
    `To sign in with MFA using ${phoneNumber}, use the code ${code}.`
  );

  return {
    phoneResponseInfo: {
      sessionInfo,
    },
  };
}

async function mfaSignInFinalize(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitV2FinalizeMfaSignInRequest"]
): Promise<Schemas["GoogleCloudIdentitytoolkitV2FinalizeMfaSignInResponse"]> {
  assert(!state.disableAuth, "PROJECT_DISABLED");
  assert(
    (state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
      state.mfaConfig.enabledProviders?.includes("PHONE_SMS"),
    "OPERATION_NOT_ALLOWED : SMS based MFA not enabled."
  );
  // Inconsistent with mfaSignInStart (where MISSING_MFA_PENDING_CREDENTIAL is
  // returned), but matches production behavior.
  assert(reqBody.mfaPendingCredential, "MISSING_CREDENTIAL : Please set MFA Pending Credential.");
  assert(reqBody.phoneVerificationInfo, "INVALID_ARGUMENT : MFA provider not supported!");

  if (reqBody.phoneVerificationInfo.androidVerificationProof) {
    throw new NotImplementedError("androidVerificationProof is unsupported!");
  }
  const { code, sessionInfo } = reqBody.phoneVerificationInfo;
  assert(code, "MISSING_CODE");
  assert(sessionInfo, "MISSING_SESSION_INFO");

  const phoneNumber = verifyPhoneNumber(state, sessionInfo, code);

  let { user, signInProvider } = parsePendingCredential(state, reqBody.mfaPendingCredential);
  const enrollment = user.mfaInfo?.find(
    (enrollment) => enrollment.unobfuscatedPhoneInfo === phoneNumber
  );

  const { updates, extraClaims } = await fetchBlockingFunction(
    state,
    BlockingFunctionEvents.BEFORE_SIGN_IN,
    user,
    { signInMethod: signInProvider, signInSecondFactor: "phone" }
  );
  user = state.updateUserByLocalId(user.localId, {
    ...updates,
    lastLoginAt: Date.now().toString(),
  });

  assert(enrollment && enrollment.mfaEnrollmentId, "MFA_ENROLLMENT_NOT_FOUND");
  // User may have been disabled after blocking function, but only throw after
  // writing user to store
  assert(!user.disabled, "USER_DISABLED");

  const { idToken, refreshToken } = issueTokens(state, user, signInProvider, {
    extraClaims,
    secondFactor: { identifier: enrollment.mfaEnrollmentId, provider: PROVIDER_PHONE },
  });
  return {
    idToken,
    refreshToken,
  };
}

function getConfig(state: ProjectState): Schemas["GoogleCloudIdentitytoolkitAdminV2Config"] {
  // Shouldn't error on this but need assertion for type checking
  assert(
    state instanceof AgentProjectState,
    "((Can only get top-level configurations on agent projects.))"
  );
  return state.config;
}

function updateConfig(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitAdminV2Config"],
  ctx: ExegesisContext
): Schemas["GoogleCloudIdentitytoolkitAdminV2Config"] {
  assert(
    state instanceof AgentProjectState,
    "((Can only update top-level configurations on agent projects.))"
  );
  for (const event in reqBody.blockingFunctions?.triggers) {
    if (Object.prototype.hasOwnProperty.call(reqBody.blockingFunctions!.triggers, event)) {
      assert(
        Object.values(BlockingFunctionEvents).includes(event as BlockingFunctionEvents),
        "INVALID_BLOCKING_FUNCTION : ((Event type is invalid.))"
      );
      assert(
        parseAbsoluteUri(reqBody.blockingFunctions!.triggers[event].functionUri!),
        "INVALID_BLOCKING_FUNCTION : ((Expected an absolute URI with valid scheme and host.))"
      );
    }
  }
  return state.updateConfig(reqBody, ctx.params.query.updateMask);
}

export type AuthOperation = (
  state: ProjectState,
  reqBody: object,
  ctx: ExegesisContext
) => Promise<object> | object;

export type AuthOps = {
  [key: string]: AuthOps | AuthOperation;
};

function coercePrimitiveToString(value: unknown): string | undefined {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
      return value.toString();
    default:
      return undefined;
  }
}

function redactPasswordHash<T extends { passwordHash?: string }>(user: T): T {
  // In production, salt will be removed and passwordHash will be set to
  // "UkVEQUNURUQ=" (i.e. "REDACTED" in base64), unless exporting users.
  // The emulator does NOT do that, allowing easier inspection (e.g. in tests).
  // Developers should not put real secrets in the Auth Emulator anyway.
  return user;
}

function hashPassword(password: string, salt: string): string {
  // We don't actually hash passwords because this is an emulator.
  // Secrets should not be entered at all here and let's not give
  // people a fake sense of security.
  return `fakeHash:salt=${salt}:password=${password}`;
}

function issueTokens(
  state: ProjectState,
  user: UserInfo,
  signInProvider: string,
  {
    extraClaims,
    secondFactor,
    signInAttributes,
  }: {
    extraClaims?: Record<string, unknown>;
    secondFactor?: SecondFactorRecord;
    signInAttributes?: unknown;
  } = {}
): { idToken: string; refreshToken?: string; expiresIn: string } {
  user = state.updateUserByLocalId(user.localId, { lastRefreshAt: new Date().toISOString() });

  const tenantId = state instanceof TenantProjectState ? state.tenantId : undefined;

  const expiresInSeconds = 60 * 60;
  const idToken = generateJwt(user, {
    projectId: state.projectId,
    signInProvider,
    expiresInSeconds,
    extraClaims,
    secondFactor,
    tenantId,
    signInAttributes,
  });
  const refreshToken = state.createRefreshTokenFor(user, signInProvider, {
    extraClaims,
    secondFactor,
  });
  return {
    idToken,
    refreshToken,
    expiresIn: expiresInSeconds.toString(), // String typed in API spec.
  };
}

function parseIdToken(
  state: ProjectState,
  idToken: string
): {
  user: UserInfo;
  payload: FirebaseJwtPayload;
  signInProvider: string;
} {
  const decoded = decodeJwt(idToken, { complete: true }) as {
    header: JwtHeader;
    payload: FirebaseJwtPayload;
  } | null;
  assert(decoded, "INVALID_ID_TOKEN");
  if (decoded.header.alg !== "none") {
    // This emulator itself never generates secure JWTs, so reaching here
    // probably means somehow a production auth token was sent to it.
    // Since the emulator does not have private keys or any other means of
    // validating the JWT, we'll just proceed with a warning. But the
    // request will most likely fail below with USER_NOT_FOUND.
    EmulatorLogger.forEmulator(Emulators.AUTH).log(
      "WARN",
      "Received a signed JWT. Auth Emulator does not validate JWTs and IS NOT SECURE"
    );
  }
  if (decoded.payload.firebase.tenant) {
    assert(
      state instanceof TenantProjectState,
      "((Parsed token that belongs to tenant in a non-tenant project.))"
    );
    assert(decoded.payload.firebase.tenant === state.tenantId, "TENANT_ID_MISMATCH");
  }
  const user = state.getUserByLocalId(decoded.payload.user_id);
  assert(user, "USER_NOT_FOUND");
  // To make interactive debugging easier, idTokens in the emulator never expire
  // due to the passage of time (exp unchecked) but they may still be _revoked_:
  assert(!user.validSince || decoded.payload.iat >= Number(user.validSince), "TOKEN_EXPIRED");
  assert(!user.disabled, "USER_DISABLED");

  const signInProvider = decoded.payload.firebase.sign_in_provider;
  return { user, signInProvider, payload: decoded.payload };
}

function generateJwt(
  user: UserInfo,
  {
    projectId,
    signInProvider,
    expiresInSeconds,
    extraClaims = {},
    secondFactor,
    tenantId,
    signInAttributes,
  }: {
    projectId: string;
    signInProvider: string;
    expiresInSeconds: number;
    extraClaims?: Record<string, unknown>;
    secondFactor?: SecondFactorRecord;
    tenantId?: string;
    signInAttributes?: unknown;
  }
): string {
  const identities: Record<string, string[]> = {};
  if (user.email) {
    identities["email"] = [user.email];
  }
  if (user.providerUserInfo) {
    for (const providerInfo of user.providerUserInfo) {
      if (
        providerInfo.providerId &&
        providerInfo.providerId !== PROVIDER_PASSWORD &&
        providerInfo.rawId
      ) {
        const ids = identities[providerInfo.providerId] || [];
        ids.push(providerInfo.rawId);
        identities[providerInfo.providerId] = ids;
      }
    }
  }

  const customAttributes = JSON.parse(user.customAttributes || "{}") as Record<string, unknown>;
  const customPayloadFields: Partial<FirebaseJwtPayload> = {
    // Non-reserved fields (set before custom attributes):
    name: user.displayName,
    picture: user.photoUrl,

    ...customAttributes,
    ...extraClaims,

    // Reserved fields (set after custom attributes):
    email: user.email,
    email_verified: user.emailVerified,
    phone_number: user.phoneNumber,
    // This field is only set for anonymous sign-in but not for any other
    // provider (such as email or Google) in production. Let's match that.
    provider_id: signInProvider === "anonymous" ? signInProvider : undefined,
    auth_time: toUnixTimestamp(getAuthTime(user)),
    user_id: user.localId,
    firebase: {
      identities,
      sign_in_provider: signInProvider,
      second_factor_identifier: secondFactor?.identifier,
      sign_in_second_factor: secondFactor?.provider,
      tenant: tenantId,
      sign_in_attributes: signInAttributes,
    },
  };

  const jwtStr = signJwt(
    customPayloadFields,
    // secretOrPrivateKey is required for jsonwebtoken v9, see
    // https://github.com/auth0/node-jsonwebtoken/wiki/Migration-Notes:-v8-to-v9
    // Tokens generated by the auth emulator are intentionally insecure and are
    // not meant to be used in production. Thus, a fake secret is used here.
    "fake-secret",
    {
      // Generate a unsigned (insecure) JWT. This is accepted by many other
      // emulators (e.g. Cloud Firestore Emulator) but will not work in
      // production of course. This removes the need to sign / verify tokens.
      algorithm: "none",
      expiresIn: expiresInSeconds,

      subject: user.localId,
      // TODO: Should this point to an emulator URL?
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    }
  );
  return jwtStr;
}

function getAuthTime(user: UserInfo): Date {
  if (user.lastLoginAt != null) {
    const millisSinceEpoch = parseInt(user.lastLoginAt, 10);
    const authTime = new Date(millisSinceEpoch);
    if (isNaN(authTime.getTime())) {
      throw new Error(`Internal assertion error: invalid user.lastLoginAt = ${user.lastLoginAt}`);
    }
    return authTime;
  } else if (user.lastRefreshAt != null) {
    const authTime = new Date(user.lastRefreshAt); // Parse from ISO date string.
    if (isNaN(authTime.getTime())) {
      throw new Error(
        `Internal assertion error: invalid user.lastRefreshAt = ${user.lastRefreshAt}`
      );
    }
    return authTime;
  } else {
    throw new Error(`Internal assertion error: Missing user.lastLoginAt and user.lastRefreshAt`);
  }
}

function verifyPhoneNumber(state: ProjectState, sessionInfo: string, code: string): string {
  const verification = state.getVerificationCodeBySessionInfo(sessionInfo);
  assert(verification, "INVALID_SESSION_INFO");
  assert(verification.code === code, "INVALID_CODE");

  state.deleteVerificationCodeBySessionInfo(sessionInfo);
  return verification.phoneNumber;
}

const CUSTOM_ATTRIBUTES_MAX_LENGTH = 1000;

function validateSerializedCustomClaims(claims: string): void {
  assert(claims.length <= CUSTOM_ATTRIBUTES_MAX_LENGTH, "CLAIMS_TOO_LARGE");

  let parsed;
  try {
    parsed = JSON.parse(claims);
  } catch {
    throw new BadRequestError("INVALID_CLAIMS");
  }
  validateCustomClaims(parsed);
}

// https://firebase.google.com/docs/auth/admin/create-custom-tokens#create_custom_tokens_using_the_firebase_admin_sdk
const FORBIDDEN_CUSTOM_CLAIMS = [
  "iss",
  "aud",
  "sub",
  "iat",
  "exp",
  "nbf",
  "jti",
  "nonce",
  "azp",
  "acr",
  "amr",
  "cnf",
  "auth_time",
  "firebase",
  "at_hash",
  "c_hash",
];

function validateCustomClaims(claims: unknown): asserts claims is Record<string, unknown> {
  // Only JSON objects (maps) are valid. Others are not.
  assert(typeof claims === "object" && claims != null && !Array.isArray(claims), "INVALID_CLAIMS");
  for (const reservedField of FORBIDDEN_CUSTOM_CLAIMS) {
    assert(!(reservedField in claims), `FORBIDDEN_CLAIM : ${reservedField}`);
  }
}

// generates a new random ID, checking against an optional set of "existing ids" for
// uniqueness. if a unique ID cannot be generated in 10 tries, an internal error is
// thrown. the ID generated by this method is not added to the set provided to this
// method, callers must manage their own state.
function newRandomId(length: number, existingIds?: Set<string>): string {
  for (let i = 0; i < 10; i++) {
    const id = randomId(length);
    if (!existingIds?.has(id)) {
      return id;
    }
  }
  throw new InternalError(
    "INTERNAL_ERROR : Failed to generate a random ID after 10 attempts",
    "INTERNAL"
  );
}

function getMfaEnrollmentsFromRequest(
  state: ProjectState,
  request: MfaEnrollments,
  options?: { generateEnrollmentIds: boolean }
): MfaEnrollments {
  const enrollments: MfaEnrollments = [];
  const phoneNumbers: Set<string> = new Set<string>();
  const enrollmentIds: Set<string> = new Set<string>();
  for (const enrollment of request) {
    assert(
      enrollment.phoneInfo && isValidPhoneNumber(enrollment.phoneInfo),
      "INVALID_MFA_PHONE_NUMBER : Invalid format."
    );
    if (!phoneNumbers.has(enrollment.phoneInfo)) {
      const mfaEnrollmentId = options?.generateEnrollmentIds
        ? newRandomId(28, enrollmentIds)
        : enrollment.mfaEnrollmentId;
      assert(mfaEnrollmentId, "INVALID_MFA_ENROLLMENT_ID : mfaEnrollmentId must be defined.");
      assert(!enrollmentIds.has(mfaEnrollmentId), "DUPLICATE_MFA_ENROLLMENT_ID");
      enrollments.push({
        ...enrollment,
        mfaEnrollmentId,
        unobfuscatedPhoneInfo: enrollment.phoneInfo,
      });
      phoneNumbers.add(enrollment.phoneInfo);
      enrollmentIds.add(mfaEnrollmentId);
    }
  }
  return state.validateMfaEnrollments(enrollments);
}

function getNormalizedUri(reqBody: {
  requestUri?: string | undefined;
  postBody?: string | undefined;
}): URL {
  assert(reqBody.requestUri, "MISSING_REQUEST_URI");
  const normalizedUri = parseAbsoluteUri(reqBody.requestUri);
  assert(normalizedUri, "INVALID_REQUEST_URI");

  if (reqBody.postBody) {
    const postBodyParams = new URLSearchParams(reqBody.postBody);
    for (const key of postBodyParams.keys()) {
      normalizedUri.searchParams.set(key, postBodyParams.get(key) as string);
    }
  }
  const fragment = normalizedUri.hash.replace(/^#/, "");
  if (fragment) {
    const fragmentParams = new URLSearchParams(fragment);
    for (const key of fragmentParams.keys()) {
      normalizedUri.searchParams.set(key, fragmentParams.get(key) as string);
    }
    normalizedUri.hash = "";
  }
  return normalizedUri;
}

function parseClaims(idTokenOrJsonClaims: string | undefined): IdpJwtPayload | undefined {
  if (!idTokenOrJsonClaims) {
    return undefined;
  }
  let claims: IdpJwtPayload;
  if (idTokenOrJsonClaims.startsWith("{")) {
    try {
      claims = JSON.parse(idTokenOrJsonClaims);
    } catch {
      throw new BadRequestError(
        `INVALID_IDP_RESPONSE : Unable to parse id_token: ${idTokenOrJsonClaims} ((Auth Emulator failed to parse fake id_token as strict JSON.))`
      );
    }
  } else {
    const decoded = decodeJwt(idTokenOrJsonClaims, { json: true });
    if (!decoded) {
      return undefined;
    }
    claims = decoded as IdpJwtPayload;
  }

  assert(
    claims.sub,
    'INVALID_IDP_RESPONSE : Invalid Idp Response: id_token missing required fields. ((Missing "sub" field. This field is required and must be a unique identifier.))'
  );
  assert(
    typeof claims.sub === "string",
    'INVALID_IDP_RESPONSE : ((The "sub" field must be a string.))'
  );
  return claims;
}

function fakeFetchUserInfoFromIdp(
  providerId: string,
  claims: IdpJwtPayload,
  samlResponse?: SamlResponse
): {
  response: SignInWithIdpResponse;
  rawId: string;
} {
  const rawId = claims.sub;

  // Some common fields found in many IDPs.
  const email = claims.email ? canonicalizeEmailAddress(claims.email) : undefined;
  const emailVerified = !!claims.email_verified;
  const displayName = claims.name;
  const photoUrl = claims.picture;

  const response: SignInWithIdpResponse = {
    kind: "identitytoolkit#VerifyAssertionResponse",
    context: "",

    providerId,
    displayName,
    fullName: displayName,
    screenName: claims.screen_name,
    email,
    emailVerified,
    photoUrl,
  };

  let federatedId = rawId;
  switch (providerId) {
    case "google.com": {
      federatedId = `https://accounts.google.com/${rawId}`;
      let grantedScopes = "openid https://www.googleapis.com/auth/userinfo.profile";
      if (email) {
        grantedScopes += " https://www.googleapis.com/auth/userinfo.email";
      }
      response.firstName = claims.given_name;
      response.lastName = claims.family_name;
      response.rawUserInfo = JSON.stringify({
        granted_scopes: grantedScopes,
        id: rawId,
        name: displayName,
        given_name: claims.given_name,
        family_name: claims.family_name,
        verified_email: emailVerified,
        locale: "en",
        email,
        picture: photoUrl,
      });
      break;
    }
    case providerId.match(/^saml\./)?.input:
      const nameId = samlResponse?.assertion?.subject?.nameId;
      response.email = nameId && isValidEmailAddress(nameId) ? nameId : response.email;
      response.emailVerified = true;
      response.rawUserInfo = JSON.stringify(samlResponse?.assertion?.attributeStatements);
      break;
    case providerId.match(/^oidc\./)?.input:
    default:
      response.rawUserInfo = JSON.stringify(claims);
      break;
  }

  response.federatedId = federatedId;
  return { response, rawId };
}

interface AccountUpdates {
  fields?: Omit<Partial<UserInfo>, "localId" | "providerUserInfo">;
  upsertProviders?: ProviderUserInfo[];
  deleteProviders?: string[];
}

function handleLinkIdp(
  state: ProjectState,
  response: SignInWithIdpResponse,
  userFromIdToken: UserInfo
): {
  response: SignInWithIdpResponse;
  accountUpdates: AccountUpdates;
} {
  if (state.oneAccountPerEmail && response.email) {
    const userMatchingEmail = state.getUserByEmail(response.email);
    assert(
      !userMatchingEmail || userMatchingEmail.localId === userFromIdToken.localId,
      "EMAIL_EXISTS"
    );
  }
  response.localId = userFromIdToken.localId;
  const fields: AccountUpdates["fields"] = {};
  if (state.oneAccountPerEmail && response.email && !userFromIdToken.email) {
    fields.email = response.email;
    fields.emailVerified = response.emailVerified;
  }
  if (
    response.email &&
    response.emailVerified &&
    (fields.email || userFromIdToken.email) === response.email
  ) {
    fields.emailVerified = true;
  }
  return { accountUpdates: { fields }, response };
}

function handleIdpSigninEmailNotRequired(
  response: SignInWithIdpResponse,
  userMatchingProvider: UserInfo | undefined
): {
  response: SignInWithIdpResponse;
  accountUpdates: AccountUpdates;
} {
  if (userMatchingProvider) {
    return {
      response: { ...response, localId: userMatchingProvider.localId },
      // No special updates needed.
      accountUpdates: {},
    };
  } else {
    return handleIdpSignUp(response, { emailRequired: false });
  }
}

function handleIdpSigninEmailRequired(
  response: SignInWithIdpResponse,
  rawId: string,
  userMatchingProvider: UserInfo | undefined,
  userMatchingEmail: UserInfo | undefined
): {
  response: SignInWithIdpResponse;
  accountUpdates: AccountUpdates;
} {
  if (userMatchingProvider) {
    return {
      response: { ...response, localId: userMatchingProvider.localId },
      // No special updates needed.
      accountUpdates: {},
    };
  } else if (userMatchingEmail) {
    if (response.emailVerified) {
      if (
        userMatchingEmail.providerUserInfo?.some(
          (info) => info.providerId === response.providerId && info.rawId !== rawId
        )
      ) {
        // b/6793858: An account exists with the same email but different rawId,
        // i.e. when IDP has "recycled" an email address to a different account.
        response.emailRecycled = true;
      }

      response.localId = userMatchingEmail.localId;

      const accountUpdates: MakeRequired<AccountUpdates, "fields"> = {
        fields: {},
      };
      if (!userMatchingEmail.emailVerified) {
        // If the top-level email is unverified, clear existing IDPs, phone, and
        // password. Otherwise, keep them (since email ownership is verified).
        accountUpdates.fields.passwordHash = undefined;
        accountUpdates.fields.phoneNumber = undefined;
        accountUpdates.fields.validSince = toUnixTimestamp(new Date()).toString();
        accountUpdates.deleteProviders = userMatchingEmail.providerUserInfo?.map(
          (info) => info.providerId
        );
      }

      // Set profile attributes to IDP-provided fields, discarding any old data.
      accountUpdates.fields.dateOfBirth = response.dateOfBirth;
      accountUpdates.fields.displayName = response.displayName;
      accountUpdates.fields.language = response.language;
      accountUpdates.fields.photoUrl = response.photoUrl;
      accountUpdates.fields.screenName = response.screenName;

      accountUpdates.fields.emailVerified = true; // Now verified by IDP.
      return { response, accountUpdates };
    } else {
      response.needConfirmation = true;
      response.localId = userMatchingEmail.localId;
      response.verifiedProvider = userMatchingEmail.providerUserInfo
        ?.map((info) => info.providerId)
        .filter((id) => id !== PROVIDER_PASSWORD && id !== PROVIDER_PHONE);
      return { response, accountUpdates: {} };
    }
  } else {
    return handleIdpSignUp(response, { emailRequired: true });
  }
}

function handleIdpSignUp(
  response: SignInWithIdpResponse,
  options: { emailRequired: boolean }
): {
  response: SignInWithIdpResponse;
  accountUpdates: AccountUpdates;
} {
  const accountUpdates: MakeRequired<AccountUpdates, "fields"> = {
    fields: {
      dateOfBirth: response.dateOfBirth,
      displayName: response.displayName,
      language: response.language,
      photoUrl: response.photoUrl,
      screenName: response.screenName,
    },
  };

  // If emailRequired is false, the email is NOT copied to user.email.
  // (It may still be available in user.providerUserInfo if populated by IDP).
  // See: https://support.google.com/firebase/answer/9134820?hl=en
  if (options.emailRequired && response.email) {
    accountUpdates.fields.email = response.email;
    accountUpdates.fields.emailVerified = response.emailVerified;
  }

  return {
    response: { ...response, isNewUser: true },
    accountUpdates,
  };
}

type MfaEnrollment = Schemas["GoogleCloudIdentitytoolkitV1MfaEnrollment"];

interface MfaPendingCredential {
  _AuthEmulatorMfaPendingCredential: string;
  localId: string;
  signInProvider: string;
  projectId: string;
  tenantId?: string;
  // MfaPendingCredential in emulator never expire to make interactive debugging
  // a bit easier. Therefore, there's no need to record createdAt timestamps.
}

function mfaPending(
  state: ProjectState,
  user: UserInfo,
  signInProvider: string
): { mfaPendingCredential: string; mfaInfo: MfaEnrollment[] } {
  if (!user.mfaInfo) {
    throw new Error("Internal assertion error: mfaPending called on user without MFA.");
  }
  const pendingCredentialPayload: MfaPendingCredential = {
    _AuthEmulatorMfaPendingCredential: "DO NOT MODIFY",
    localId: user.localId,
    signInProvider,
    projectId: state.projectId,
  };
  if (state instanceof TenantProjectState) {
    pendingCredentialPayload.tenantId = state.tenantId;
  }

  // Encode pendingCredentialPayload using base64. We don't encrypt or sign the
  // data in the Auth Emulator but just trust developers not to modify it.
  const mfaPendingCredential = Buffer.from(
    JSON.stringify(pendingCredentialPayload),
    "utf8"
  ).toString("base64");

  return { mfaPendingCredential, mfaInfo: user.mfaInfo.map(redactMfaInfo) };
}

function redactMfaInfo(mfaInfo: MfaEnrollment): MfaEnrollment {
  return {
    displayName: mfaInfo.displayName,
    enrolledAt: mfaInfo.enrolledAt,
    mfaEnrollmentId: mfaInfo.mfaEnrollmentId,
    phoneInfo: mfaInfo.unobfuscatedPhoneInfo
      ? obfuscatePhoneNumber(mfaInfo.unobfuscatedPhoneInfo)
      : undefined,
  };
}

// Create an obfuscated version of a phone number, where all but the last
// four digits are replaced by the character "*".
function obfuscatePhoneNumber(phoneNumber: string): string {
  const split = phoneNumber.split("");
  let digitsEncountered = 0;
  for (let i = split.length - 1; i >= 0; i--) {
    if (/[0-9]/.test(split[i])) {
      digitsEncountered++;
      if (digitsEncountered > 4) {
        split[i] = "*";
      }
    }
  }
  return split.join("");
}

function parsePendingCredential(
  state: ProjectState,
  pendingCredential: string
): {
  user: UserInfo;
  signInProvider: string;
} {
  let pendingCredentialPayload: MfaPendingCredential;
  try {
    const json = Buffer.from(pendingCredential, "base64").toString("utf8");
    pendingCredentialPayload = JSON.parse(json) as MfaPendingCredential;
  } catch {
    assert(false, "((Invalid phoneVerificationInfo.mfaPendingCredential.))");
  }
  assert(
    pendingCredentialPayload._AuthEmulatorMfaPendingCredential,
    "((Invalid phoneVerificationInfo.mfaPendingCredential.))"
  );
  assert(
    pendingCredentialPayload.projectId === state.projectId,
    "INVALID_PROJECT_ID : Project ID does not match MFA pending credential."
  );
  if (state instanceof TenantProjectState) {
    assert(
      pendingCredentialPayload.tenantId === state.tenantId,
      "INVALID_PROJECT_ID : Project ID does not match MFA pending credential."
    );
  }

  const { localId, signInProvider } = pendingCredentialPayload;
  const user = state.getUserByLocalId(localId);
  assert(user, "((User in pendingCredentialPayload does not exist.))");

  return { user, signInProvider };
}

function createTenant(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitAdminV2Tenant"]
): Schemas["GoogleCloudIdentitytoolkitAdminV2Tenant"] {
  if (!(state instanceof AgentProjectState)) {
    throw new InternalError("INTERNAL_ERROR : Can only create tenant in agent project", "INTERNAL");
  }

  const mfaConfig = reqBody.mfaConfig ?? {};
  if (!("state" in mfaConfig)) {
    mfaConfig.state = "DISABLED";
  }
  if (!("enabledProviders" in mfaConfig)) {
    mfaConfig.enabledProviders = [];
  }

  // Default to production settings if unset
  const tenant = {
    displayName: reqBody.displayName,
    allowPasswordSignup: reqBody.allowPasswordSignup ?? false,
    enableEmailLinkSignin: reqBody.enableEmailLinkSignin ?? false,
    enableAnonymousUser: reqBody.enableAnonymousUser ?? false,
    disableAuth: reqBody.disableAuth ?? false,
    mfaConfig: mfaConfig as MfaConfig,
    tenantId: "", // Placeholder until one is generated
  };

  return state.createTenant(tenant);
}

function listTenants(
  state: ProjectState,
  reqBody: unknown,
  ctx: ExegesisContext
): Schemas["GoogleCloudIdentitytoolkitAdminV2ListTenantsResponse"] {
  assert(state instanceof AgentProjectState, "((Can only list tenants in agent project.))");
  const pageSize = Math.min(Math.floor(ctx.params.query.pageSize) || 20, 1000);
  const tenants = state.listTenants(ctx.params.query.pageToken);

  // As a non-standard behavior, passing in negative pageSize will
  // return all users starting from the pageToken.
  let nextPageToken: string | undefined = undefined;
  if (pageSize > 0 && tenants.length >= pageSize) {
    tenants.length = pageSize;
    nextPageToken = tenants[tenants.length - 1].tenantId;
  }

  return {
    nextPageToken,
    tenants,
  };
}

function deleteTenant(state: ProjectState): Schemas["GoogleProtobufEmpty"] {
  assert(state instanceof TenantProjectState, "((Can only delete tenant on tenant projects.))");
  state.delete();
  return {};
}

function getTenant(state: ProjectState): Schemas["GoogleCloudIdentitytoolkitAdminV2Tenant"] {
  assert(state instanceof TenantProjectState, "((Can only get tenant on tenant projects.))");
  return state.tenantConfig;
}

function updateTenant(
  state: ProjectState,
  reqBody: Schemas["GoogleCloudIdentitytoolkitAdminV2Tenant"],
  ctx: ExegesisContext
): Schemas["GoogleCloudIdentitytoolkitAdminV2Tenant"] {
  assert(state instanceof TenantProjectState, "((Can only update tenant on tenant projects.))");
  return state.updateTenant(reqBody, ctx.params.query.updateMask);
}

function isMfaEnabled(state: ProjectState, user: UserInfo) {
  return (
    (state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
    user.mfaInfo?.length
  );
}

// TODO: Timeout is 60s. Should we make the timeout an emulator configuration?
async function fetchBlockingFunction(
  state: ProjectState,
  event: BlockingFunctionEvents,
  user: UserInfo,
  options: {
    signInMethod?: string;
    signInSecondFactor?: string;
    rawUserInfo?: string;
    signInAttributes?: string;
  } = {},
  oauthTokens: {
    oauthIdToken?: string;
    oauthAccessToken?: string;
    oauthRefreshToken?: string;
    oauthTokenSecret?: string;
    oauthExpiresIn?: string;
  } = {},
  timeoutMs: number = 60000
): Promise<{
  updates: BlockingFunctionUpdates;
  extraClaims?: Record<string, unknown>;
}> {
  const url = state.getBlockingFunctionUri(event);

  // No-op if blocking function is not present
  if (!url) {
    return { updates: {} };
  }

  const jwt = generateBlockingFunctionJwt(state, event, url, timeoutMs, user, options, oauthTokens);
  const reqBody = {
    data: {
      jwt,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: BlockingFunctionResponsePayload;
  let ok: boolean;
  let status: number;
  let text: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal: controller.signal,
    });
    ok = res.ok;
    status = res.status;
    text = await res.text();
  } catch (thrown: any) {
    const err = thrown instanceof Error ? thrown : new Error(thrown);
    const isAbortError = err.name.includes("AbortError");
    if (isAbortError) {
      throw new InternalError(
        `BLOCKING_FUNCTION_ERROR_RESPONSE : ((Deadline exceeded making request to ${url}.))`,
        err.message
      );
    }
    // All other server errors
    throw new InternalError(
      `BLOCKING_FUNCTION_ERROR_RESPONSE : ((Failed to make request to ${url}.))`,
      err.message
    );
  } finally {
    clearTimeout(timeout);
  }

  assert(
    ok,
    `BLOCKING_FUNCTION_ERROR_RESPONSE : ((HTTP request to ${url} returned HTTP error ${status}: ${text}))`
  );

  try {
    response = JSON.parse(text) as BlockingFunctionResponsePayload;
  } catch (thrown: any) {
    const err = thrown instanceof Error ? thrown : new Error(thrown);
    throw new InternalError(
      `BLOCKING_FUNCTION_ERROR_RESPONSE : ((Response body is not valid JSON.))`,
      err.message
    );
  }

  return processBlockingFunctionResponse(event, response);
}

function processBlockingFunctionResponse(
  event: BlockingFunctionEvents,
  response: BlockingFunctionResponsePayload
): {
  updates: BlockingFunctionUpdates;
  extraClaims?: Record<string, unknown>;
} {
  // Only return updates that are specified in the update mask
  let extraClaims;
  const updates: BlockingFunctionUpdates = {};
  if (response.userRecord) {
    const userRecord = response.userRecord;
    assert(
      userRecord.updateMask,
      "BLOCKING_FUNCTION_ERROR_RESPONSE : ((Response UserRecord is missing updateMask.))"
    );
    const mask = userRecord.updateMask;
    const fields = mask.split(",");

    for (const field of fields) {
      switch (field) {
        case "displayName":
        case "photoUrl":
          updates[field] = coercePrimitiveToString(userRecord[field]);
          break;
        case "disabled":
        case "emailVerified":
          updates[field] = !!userRecord[field];
          break;
        case "customClaims":
          const customClaims = JSON.stringify(userRecord.customClaims!);
          validateSerializedCustomClaims(customClaims);
          updates.customAttributes = customClaims;
          break;
        // Session claims are only returned in beforeSignIn and will be ignored
        // otherwise. For more info, see
        // https://cloud.google.com/identity-platform/docs/blocking-functions#modifying_a_user
        case "sessionClaims":
          if (event !== BlockingFunctionEvents.BEFORE_SIGN_IN) {
            break;
          }
          try {
            extraClaims = userRecord.sessionClaims;
          } catch {
            throw new BadRequestError(
              "BLOCKING_FUNCTION_ERROR_RESPONSE : ((Response has malformed session claims.))"
            );
          }
          break;
        default:
          break;
      }
    }
  }

  return { updates, extraClaims };
}

function generateBlockingFunctionJwt(
  state: ProjectState,
  event: BlockingFunctionEvents,
  url: string,
  timeoutMs: number,
  user: UserInfo,
  options: {
    signInMethod?: string;
    signInSecondFactor?: string;
    rawUserInfo?: string;
    signInAttributes?: string;
  },
  oauthTokens: {
    oauthIdToken?: string;
    oauthAccessToken?: string;
    oauthRefreshToken?: string;
    oauthTokenSecret?: string;
    oauthExpiresIn?: string;
  }
): string {
  const issuedAt = toUnixTimestamp(new Date());
  const jwt: BlockingFunctionsJwtPayload = {
    iss: `https://securetoken.google.com/${state.projectId}`,
    aud: url,
    iat: issuedAt,
    exp: issuedAt + timeoutMs / 100,
    event_id: randomBase64UrlStr(16),
    event_type: event,
    user_agent: "NotYetSupportedInFirebaseAuthEmulator", // TODO: switch to express.js to get UserAgent
    ip_address: "127.0.0.1", // TODO: switch to express.js to get IP address
    locale: "en",
    user_record: {
      uid: user.localId,
      email: user.email,
      email_verified: user.emailVerified,
      display_name: user.displayName,
      photo_url: user.photoUrl,
      disabled: user.disabled,
      phone_number: user.phoneNumber,
      custom_claims: JSON.parse(user.customAttributes || "{}") as Record<string, unknown>,
    },
    sub: user.localId,
    sign_in_method: options.signInMethod,
    sign_in_second_factor: options.signInSecondFactor,
    sign_in_attributes: options.signInAttributes,
    raw_user_info: options.rawUserInfo,
  };

  if (state instanceof TenantProjectState) {
    jwt.tenant_id = state.tenantId;
    jwt.user_record.tenant_id = state.tenantId;
  }

  const providerData = [];
  if (user.providerUserInfo) {
    for (const providerUserInfo of user.providerUserInfo) {
      const provider: Provider = {
        provider_id: providerUserInfo.providerId,
        display_name: providerUserInfo.displayName,
        photo_url: providerUserInfo.photoUrl,
        email: providerUserInfo.email,
        uid: providerUserInfo.rawId,
        phone_number: providerUserInfo.phoneNumber,
      };
      providerData.push(provider);
    }
  }
  jwt.user_record.provider_data = providerData;

  if (user.mfaInfo) {
    const enrolledFactors = [];
    for (const mfaEnrollment of user.mfaInfo) {
      if (!mfaEnrollment.mfaEnrollmentId) {
        continue;
      }
      const enrolledFactor: EnrolledFactor = {
        uid: mfaEnrollment.mfaEnrollmentId,
        display_name: mfaEnrollment.displayName,
        enrollment_time: mfaEnrollment.enrolledAt,
        phone_number: mfaEnrollment.phoneInfo,
        factor_id: PROVIDER_PHONE,
      };
      enrolledFactors.push(enrolledFactor);
    }
    jwt.user_record.multi_factor = {
      enrolled_factors: enrolledFactors,
    };
  }

  if (user.lastLoginAt || user.createdAt) {
    jwt.user_record.metadata = {
      last_sign_in_time: user.lastLoginAt,
      creation_time: user.createdAt,
    };
  }

  if (state.shouldForwardCredentialToBlockingFunction("accessToken")) {
    jwt.oauth_access_token = oauthTokens.oauthAccessToken;
    jwt.oauth_token_secret = oauthTokens.oauthTokenSecret;
    jwt.oauth_expires_in = oauthTokens.oauthExpiresIn;
  }

  if (state.shouldForwardCredentialToBlockingFunction("idToken")) {
    jwt.oauth_id_token = oauthTokens.oauthIdToken;
  }

  if (state.shouldForwardCredentialToBlockingFunction("refreshToken")) {
    jwt.oauth_refresh_token = oauthTokens.oauthRefreshToken;
  }

  const jwtStr = signJwt(jwt, "fake-secret", {
    algorithm: "none",
  });

  return jwtStr;
}

export function parseBlockingFunctionJwt(jwt: string): BlockingFunctionsJwtPayload {
  const decoded = decodeJwt(jwt, { json: true }) as BlockingFunctionsJwtPayload;
  assert(decoded, "((Invalid blocking function jwt.))");
  assert(decoded.iss, "((Invalid blocking function jwt, missing `iss` claim.))");
  assert(decoded.aud, "((Invalid blocking function jwt, missing `aud` claim.))");
  assert(decoded.user_record, "((Invalid blocking function jwt, missing `user_record` claim.))");
  return decoded;
}

export interface SamlAssertion {
  subject?: {
    nameId?: string;
  };
  attributeStatements?: unknown;
}

export interface SamlResponse {
  assertion?: SamlAssertion;
}

export interface FirebaseJwtPayload {
  // Standard fields:
  iat: number; // issuedAt (in seconds since epoch)
  exp: number; // expiresAt (in seconds since epoch)
  iss: string; // issuer
  aud: string; // audience (=projectId)
  // ...and other fields that we don't care for now.

  // Firebase-specific fields:

  // the last login time (in seconds since epoch), may be different from iat
  auth_time: number;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  name?: string;
  picture?: string;
  user_id: string;
  provider_id?: string;
  firebase: {
    identities?: {
      email?: string[];
      phone?: string[];
    };
    sign_in_provider: string;
    sign_in_second_factor?: string;
    second_factor_identifier?: string;
    tenant?: string;
    sign_in_attributes?: unknown;
  };
  // ...and other fields that we don't care for now.
}

/**
 * Typing for some well-known claims in IDPs (Google / Apple).
 *
 * This is a union of Google and Apple ID Token claims. The typings are for
 * facilitating emulator development only, and are not formal contracts. The
 * emulator code extracts information from these tokens using the fields below.
 *
 * Note that these fields may change at any time and other OpenID Connect
 * providers may or may not provide the same fields, even if some fields below
 * are marked as non-optional. See links below for latest documentation.
 * @see https://developers.google.com/identity/protocols/oauth2/openid-connect#an-id-tokens-payload
 * @see https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/authenticating_users_with_sign_in_with_apple#3383773
 */
export interface IdpJwtPayload {
  /** Unique identifier of user at IDP. Also known as "rawId" in Firebase Auth. */
  sub: string;

  // Issuer (IDP identifer / URL) and Audience (Developer app ID), ignored.
  iss: string; // Ignored
  aud: string; // Ignored

  // Expiration and Issued At, both intentionally ignored by the Auth Emulator.
  // This means clients / tests can keep reusing the same tokens if needed.
  exp: number;
  iat: number;

  /**
   * Email address of the user. Optional. May be a private email (Apple).
   * DO NOT use as primary key! Use "sub" instead.
   * The Auth Emulator uses this for oneAccountPerEmail enforcement.
   */
  email?: string;

  /**
   * Whether email above is verified at IDP. Apple may put the string "true"
   * instead of a boolean here (as documented in the link above).
   */
  email_verified?: boolean | "true";

  /**
   * Used to protect against replay attacks. Intentionally ignored by the Auth
   * Emulator (i.e. no protection against replay attacks, unlike production).
   */
  nonce?: string;
  nonce_supported?: boolean;

  // These fields are extracted by the Auth Emulator into ProviderUserInfo.
  // Each and every field below are honored by the Auth Emulator for testing
  // purposes for all IDPs. Note that this is NOT the case for production with
  // real IDPs though -- IDPs may not support / provide any of them.
  // Firebase developers may populate these fields in fake JWTs to help testing.

  /**
   * The user's full name (a.k.a displayName in Firebase Auth).
   * Google sometimes (*see link above) provides it in claims. Apple never
   * includes it in ID Tokens. Works with the Auth Emulator nonetheless.
   *
   * Not to be confused with screen_name below.
   */
  name?: string;

  /**
   * The user's screenName (sometimes called a "username" or "handle").
   * DO NOT use as primary key! Use "sub" instead.
   */
  screen_name?: string;

  /**
   * The user's profile picture URL (a.k.a. photoUrl). Google sometimes
   * (*see link above) provide it.
   */
  picture?: string;

  // These fields are parsed and returned by the signInWithIdp API in the Auth
  // Emulator as if they were in the user profile returned by IDPs.
  family_name?: string;
  given_name?: string;

  // TODO: Shall we provide a way to mock the entire user profile from IDPs?

  // Fields below are ignored by the Auth Emulator and only has significance if
  // explicitly parsed and relied upon in Firebase apps.

  // Apple-specific fields.
  is_private_email?: boolean | "true" | "false";
  real_user_status?: 0 | 1 | 2;

  // More Google-specific fields (in addition to a few above). For docs, see:
  // https://developers.google.com/identity/protocols/oauth2/openid-connect#an-id-tokens-payload
  profile?: string;
  azp?: string;
  at_hash?: string;
  locale?: string;
  hd?: string;
}

export interface BlockingFunctionResponsePayload {
  userRecord?: {
    updateMask?: string;
    displayName?: string;
    photoUrl?: string;
    disabled?: boolean;
    emailVerified?: boolean;
    customClaims?: Record<string, unknown>;
    sessionClaims?: Record<string, unknown>;
  };
}

export interface BlockingFunctionUpdates {
  displayName?: string;
  photoUrl?: string;
  disabled?: boolean;
  emailVerified?: boolean;
  customAttributes?: string;
}

/**
 * Information corresponding to a sign in provider.
 */
export interface Provider {
  provider_id?: string;
  display_name?: string;
  photo_url?: string;
  email?: string;
  uid?: string;
  phone_number?: string;
}

/**
 * Enrolled factors for MFA.
 */
export interface EnrolledFactor {
  uid: string;
  display_name?: string;
  enrollment_time?: string;
  phone_number?: string;
  factor_id: string;
}

/**
 * Typing for payload passed to blocking function requests.
 */
export interface BlockingFunctionsJwtPayload {
  iss: string; // issuer (=`https://securetoken.google.com/{projectId}`)
  aud: string; // audience (=`{functionUri}`)
  iat: number; // issuedAt (in seconds since epoch)
  exp: number; // expiresAt (in seconds since epoch)
  event_id: string; // event identifier (=randomly generated base 64 string)
  event_type: string; // one of BlockingFunctionEvents
  user_agent: string;
  ip_address: string;
  locale: string;
  user_record: {
    uid?: string;
    email?: string;
    email_verified?: boolean;
    display_name?: string;
    photo_url?: string;
    disabled?: boolean;
    phone_number?: string;
    provider_data?: Provider[];
    multi_factor?: {
      enrolled_factors: EnrolledFactor[];
    };
    metadata?: {
      last_sign_in_time?: string;
      creation_time?: string;
    };
    custom_claims?: Record<string, unknown>;
    tenant_id?: string; // should match top level tenant_id
  };
  tenant_id?: string; // `tenantId` if present
  sign_in_method?: string;
  sign_in_second_factor?: string;
  sign_in_attributes?: string;
  raw_user_info?: string;
  sub?: string;

  // Presence of these fields depends on blocking functions configuration
  oauth_id_token?: string;
  oauth_access_token?: string;
  oauth_token_secret?: string;
  oauth_refresh_token?: string;
  oauth_expires_in?: string;
}
