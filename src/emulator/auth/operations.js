"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBlockingFunctionJwt = exports.setAccountInfoImpl = exports.resetPassword = exports.SESSION_COOKIE_MAX_VALID_DURATION = exports.CUSTOM_TOKEN_AUDIENCE = exports.authOperations = void 0;
const url_1 = require("url");
const jsonwebtoken_1 = require("jsonwebtoken");
const node_fetch_1 = __importDefault(require("node-fetch"));
const abort_controller_1 = __importDefault(require("abort-controller"));
const utils_1 = require("./utils");
const errors_1 = require("./errors");
const types_1 = require("../types");
const emulatorLogger_1 = require("../emulatorLogger");
const state_1 = require("./state");
/**
 * Create a map from IDs to operations handlers suitable for exegesis.
 * @param state the state of the Auth Emulator
 * @return operations, keyed by their operation id.
 */
exports.authOperations = {
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
exports.CUSTOM_TOKEN_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
const MFA_INELIGIBLE_PROVIDER = new Set([
    state_1.PROVIDER_ANONYMOUS,
    state_1.PROVIDER_PHONE,
    state_1.PROVIDER_CUSTOM,
    state_1.PROVIDER_GAME_CENTER,
]);
async function signUp(state, reqBody, ctx) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    let provider;
    const timestamp = new Date();
    let updates = {
        lastLoginAt: timestamp.getTime().toString(),
    };
    if (ctx.security?.Oauth2) {
        // Privileged request.
        if (reqBody.idToken) {
            (0, errors_1.assert)(!reqBody.localId, "UNEXPECTED_PARAMETER : User ID");
        }
        if (reqBody.localId) {
            // Fail fast if localId is taken (matching production behavior).
            (0, errors_1.assert)(!state.getUserByLocalId(reqBody.localId), "DUPLICATE_LOCAL_ID");
        }
        updates.displayName = reqBody.displayName;
        updates.photoUrl = reqBody.photoUrl;
        updates.emailVerified = reqBody.emailVerified || false;
        if (reqBody.phoneNumber) {
            (0, errors_1.assert)((0, utils_1.isValidPhoneNumber)(reqBody.phoneNumber), "INVALID_PHONE_NUMBER : Invalid format.");
            (0, errors_1.assert)(!state.getUserByPhoneNumber(reqBody.phoneNumber), "PHONE_NUMBER_EXISTS");
            updates.phoneNumber = reqBody.phoneNumber;
        }
        if (reqBody.disabled) {
            updates.disabled = true;
        }
    }
    else {
        (0, errors_1.assert)(!reqBody.localId, "UNEXPECTED_PARAMETER : User ID");
        if (reqBody.idToken || reqBody.password || reqBody.email) {
            // Creating / linking email password account.
            updates.displayName = reqBody.displayName;
            updates.emailVerified = false;
            (0, errors_1.assert)(reqBody.email, "MISSING_EMAIL");
            (0, errors_1.assert)(reqBody.password, "MISSING_PASSWORD");
            provider = state_1.PROVIDER_PASSWORD;
            (0, errors_1.assert)(state.allowPasswordSignup, "OPERATION_NOT_ALLOWED");
        }
        else {
            // Most attributes are ignored when creating anon user without privilege.
            provider = state_1.PROVIDER_ANONYMOUS;
            (0, errors_1.assert)(state.enableAnonymousUser, "ADMIN_ONLY_OPERATION");
        }
    }
    // Assert a valid email address when we expect the email to have a value.
    // Prevents empty email and password string to be treated as anonymous sign in.
    if (reqBody.email || (reqBody.email === "" && provider)) {
        (0, errors_1.assert)((0, utils_1.isValidEmailAddress)(reqBody.email), "INVALID_EMAIL");
        const email = (0, utils_1.canonicalizeEmailAddress)(reqBody.email);
        (0, errors_1.assert)(!state.getUserByEmail(email), "EMAIL_EXISTS");
        updates.email = email;
    }
    if (reqBody.password) {
        (0, errors_1.assert)(reqBody.password.length >= PASSWORD_MIN_LENGTH, `WEAK_PASSWORD : Password should be at least ${PASSWORD_MIN_LENGTH} characters`);
        updates.salt = "fakeSalt" + (0, utils_1.randomId)(20);
        updates.passwordHash = hashPassword(reqBody.password, updates.salt);
        updates.passwordUpdatedAt = Date.now();
        updates.validSince = (0, utils_1.toUnixTimestamp)(new Date()).toString();
    }
    if (reqBody.mfaInfo) {
        updates.mfaInfo = getMfaEnrollmentsFromRequest(state, reqBody.mfaInfo, {
            generateEnrollmentIds: true,
        });
    }
    if (state instanceof state_1.TenantProjectState) {
        updates.tenantId = state.tenantId;
    }
    let user;
    if (reqBody.idToken) {
        ({ user } = parseIdToken(state, reqBody.idToken));
    }
    let extraClaims;
    if (!user) {
        updates.createdAt = timestamp.getTime().toString();
        const localId = reqBody.localId ?? state.generateLocalId();
        if (reqBody.email && !ctx.security?.Oauth2) {
            const userBeforeCreate = { localId, ...updates };
            const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_CREATE, userBeforeCreate, { signInMethod: "password" });
            updates = { ...updates, ...blockingResponse.updates };
        }
        user = state.createUserWithLocalId(localId, updates);
        (0, errors_1.assert)(user, "DUPLICATE_LOCAL_ID");
        if (reqBody.email && !ctx.security?.Oauth2) {
            if (!user.disabled) {
                const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, user, { signInMethod: "password" });
                updates = blockingResponse.updates;
                extraClaims = blockingResponse.extraClaims;
                user = state.updateUserByLocalId(user.localId, updates);
            }
            // User may have been disabled after either blocking function, but
            // only throw after writing user to store
            (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
        }
    }
    else {
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
function lookup(state, reqBody, ctx) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    const seenLocalIds = new Set();
    const users = [];
    function tryAddUser(maybeUser) {
        if (maybeUser && !seenLocalIds.has(maybeUser.localId)) {
            users.push(maybeUser);
            seenLocalIds.add(maybeUser.localId);
        }
    }
    if (ctx.security?.Oauth2) {
        if (reqBody.initialEmail) {
            // TODO: This is now possible. See ProjectState.getUserByInitialEmail.
            throw new errors_1.NotImplementedError("Lookup by initialEmail is not implemented.");
        }
        for (const localId of reqBody.localId ?? []) {
            tryAddUser(state.getUserByLocalId(localId));
        }
        for (const email of reqBody.email ?? []) {
            const canonicalizedEmail = (0, utils_1.canonicalizeEmailAddress)(email);
            tryAddUser(state.getUserByEmail(canonicalizedEmail));
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
    }
    else {
        (0, errors_1.assert)(reqBody.idToken, "MISSING_ID_TOKEN");
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
function batchCreate(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(reqBody.users?.length, "MISSING_USER_ACCOUNT");
    if (reqBody.sanityCheck) {
        if (state.oneAccountPerEmail) {
            const existingEmails = new Set();
            for (const userInfo of reqBody.users) {
                if (userInfo.email) {
                    (0, errors_1.assert)(!existingEmails.has(userInfo.email), `DUPLICATE_EMAIL : ${userInfo.email}`);
                    existingEmails.add(userInfo.email);
                }
            }
        }
        // Check that there is no duplicate (providerId, rawId) tuple.
        const existingProviderAccounts = new Set();
        for (const userInfo of reqBody.users) {
            for (const { providerId, rawId } of userInfo.providerUserInfo ?? []) {
                const key = `${providerId}:${rawId}`;
                (0, errors_1.assert)(!existingProviderAccounts.has(key), `DUPLICATE_RAW_ID : Provider id(${providerId}), Raw id(${rawId})`);
                existingProviderAccounts.add(key);
            }
        }
    }
    if (!reqBody.allowOverwrite) {
        const existingLocalIds = new Set();
        for (const userInfo of reqBody.users) {
            const localId = userInfo.localId || "";
            (0, errors_1.assert)(!existingLocalIds.has(localId), `DUPLICATE_LOCAL_ID : ${localId}`);
            existingLocalIds.add(localId);
        }
    }
    const errors = [];
    for (let index = 0; index < reqBody.users.length; index++) {
        const userInfo = reqBody.users[index];
        try {
            (0, errors_1.assert)(userInfo.localId, "localId is missing");
            const uploadTime = new Date();
            const fields = {
                displayName: userInfo.displayName,
                photoUrl: userInfo.photoUrl,
                lastLoginAt: userInfo.lastLoginAt,
            };
            if (userInfo.tenantId) {
                (0, errors_1.assert)(state instanceof state_1.TenantProjectState && state.tenantId === userInfo.tenantId, "Tenant id in userInfo does not match the tenant id in request.");
            }
            if (state instanceof state_1.TenantProjectState) {
                fields.tenantId = state.tenantId;
            }
            // password
            if (userInfo.passwordHash) {
                // TODO: Check and block non-emulator hashes.
                fields.passwordHash = userInfo.passwordHash;
                fields.salt = userInfo.salt;
                fields.passwordUpdatedAt = uploadTime.getTime();
            }
            else if (userInfo.rawPassword) {
                fields.salt = userInfo.salt || "fakeSalt" + (0, utils_1.randomId)(20);
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
                    if (providerId === state_1.PROVIDER_PASSWORD || providerId === state_1.PROVIDER_PHONE) {
                        // These providers are handled automatically by create / update.
                        continue;
                    }
                    if (!rawId || !providerId) {
                        if (!federatedId) {
                            (0, errors_1.assert)(false, "federatedId or (providerId & rawId) is required");
                        }
                        else {
                            // TODO
                            (0, errors_1.assert)(false, "((Parsing federatedId is not implemented in Auth Emulator; please specify providerId AND rawId as a workaround.))");
                        }
                    }
                    const existingUserWithRawId = state.getUserByProviderRawId(providerId, rawId);
                    (0, errors_1.assert)(!existingUserWithRawId || existingUserWithRawId.localId === userInfo.localId, "raw id exists in other account in database");
                    fields.providerUserInfo.push({ ...providerUserInfo, providerId, rawId });
                }
            }
            // phone number
            if (userInfo.phoneNumber) {
                (0, errors_1.assert)((0, utils_1.isValidPhoneNumber)(userInfo.phoneNumber), "phone number format is invalid");
                fields.phoneNumber = userInfo.phoneNumber;
            }
            fields.validSince = (0, utils_1.toUnixTimestamp)(uploadTime).toString();
            fields.createdAt = uploadTime.getTime().toString();
            if (fields.createdAt && !isNaN(Number(userInfo.createdAt))) {
                fields.createdAt = userInfo.createdAt;
            }
            if (userInfo.email) {
                const email = userInfo.email;
                (0, errors_1.assert)((0, utils_1.isValidEmailAddress)(email), "email is invalid");
                // For simplicity, Auth Emulator performs this check in all cases
                // (unlike production which checks only if (reqBody.sanityCheck && state.oneAccountPerEmail)).
                // We return a non-standard error message in other cases to clarify.
                const existingUserWithEmail = state.getUserByEmail(email);
                (0, errors_1.assert)(!existingUserWithEmail || existingUserWithEmail.localId === userInfo.localId, reqBody.sanityCheck && state.oneAccountPerEmail
                    ? "email exists in other account in database"
                    : `((Auth Emulator does not support importing duplicate email: ${email}))`);
                fields.email = (0, utils_1.canonicalizeEmailAddress)(email);
            }
            fields.emailVerified = !!userInfo.emailVerified;
            fields.disabled = !!userInfo.disabled;
            // MFA
            if (userInfo.mfaInfo && userInfo.mfaInfo.length > 0) {
                fields.mfaInfo = [];
                (0, errors_1.assert)(fields.email, "Second factor account requires email to be presented.");
                (0, errors_1.assert)(fields.emailVerified, "Second factor account requires email to be verified.");
                const existingIds = new Set();
                for (const enrollment of userInfo.mfaInfo) {
                    if (enrollment.mfaEnrollmentId) {
                        (0, errors_1.assert)(!existingIds.has(enrollment.mfaEnrollmentId), "Enrollment id already exists.");
                        existingIds.add(enrollment.mfaEnrollmentId);
                    }
                }
                for (const enrollment of userInfo.mfaInfo) {
                    enrollment.mfaEnrollmentId = enrollment.mfaEnrollmentId || newRandomId(28, existingIds);
                    enrollment.enrolledAt = enrollment.enrolledAt || new Date().toISOString();
                    (0, errors_1.assert)(enrollment.phoneInfo, "Second factor not supported.");
                    (0, errors_1.assert)((0, utils_1.isValidPhoneNumber)(enrollment.phoneInfo), "Phone number format is invalid");
                    enrollment.unobfuscatedPhoneInfo = enrollment.phoneInfo;
                    fields.mfaInfo.push(enrollment);
                }
            }
            if (state.getUserByLocalId(userInfo.localId)) {
                (0, errors_1.assert)(reqBody.allowOverwrite, "localId belongs to an existing account - can not overwrite.");
            }
            state.overwriteUserWithLocalId(userInfo.localId, fields);
        }
        catch (e) {
            if (e instanceof errors_1.BadRequestError) {
                // Use friendlier messages for some codes, consistent with production.
                let message = e.message;
                if (message === "INVALID_CLAIMS") {
                    message = "Invalid custom claims provided.";
                }
                else if (message === "CLAIMS_TOO_LARGE") {
                    message = "Custom claims provided are too large.";
                }
                else if (message.startsWith("FORBIDDEN_CLAIM")) {
                    message = "Custom claims provided include a reserved claim.";
                }
                errors.push({
                    index,
                    message,
                });
            }
            else {
                throw e;
            }
        }
    }
    return {
        kind: "identitytoolkit#UploadAccountResponse",
        error: errors,
    };
}
function batchDelete(state, reqBody) {
    const errors = [];
    const localIds = reqBody.localIds ?? [];
    (0, errors_1.assert)(localIds.length > 0 && localIds.length <= 1000, "LOCAL_ID_LIST_EXCEEDS_LIMIT");
    for (let index = 0; index < localIds.length; index++) {
        const localId = localIds[index];
        const user = state.getUserByLocalId(localId);
        if (!user) {
            continue;
        }
        else if (!user.disabled && !reqBody.force) {
            errors.push({
                index,
                localId,
                message: "NOT_DISABLED : Disable the account before batch deletion.",
            });
        }
        else {
            state.deleteUser(user);
        }
    }
    return { errors: errors.length ? errors : undefined };
}
function batchGet(state, reqBody, ctx) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    const maxResults = Math.min(Math.floor(ctx.params.query.maxResults) || 20, 1000);
    const users = state.queryUsers({}, { sortByField: "localId", order: "ASC", startToken: ctx.params.query.nextPageToken });
    let newPageToken = undefined;
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
function createAuthUri(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    const sessionId = reqBody.sessionId || (0, utils_1.randomId)(27);
    if (reqBody.providerId) {
        throw new errors_1.NotImplementedError("Sign-in with IDP is not yet supported.");
    }
    (0, errors_1.assert)(reqBody.identifier, "MISSING_IDENTIFIER");
    (0, errors_1.assert)(reqBody.continueUri, "MISSING_CONTINUE_URI");
    // TODO: What about non-email identifiers?
    (0, errors_1.assert)((0, utils_1.isValidEmailAddress)(reqBody.identifier), "INVALID_IDENTIFIER");
    const email = (0, utils_1.canonicalizeEmailAddress)(reqBody.identifier);
    (0, errors_1.assert)((0, utils_1.parseAbsoluteUri)(reqBody.continueUri), "INVALID_CONTINUE_URI");
    const allProviders = [];
    const signinMethods = [];
    let registered = false;
    const users = state.getUsersByEmailOrProviderEmail(email);
    if (state.oneAccountPerEmail) {
        if (users.length) {
            registered = true;
            users[0].providerUserInfo?.forEach(({ providerId }) => {
                if (providerId === state_1.PROVIDER_PASSWORD) {
                    allProviders.push(providerId);
                    if (users[0].passwordHash) {
                        signinMethods.push(state_1.PROVIDER_PASSWORD);
                    }
                    if (users[0].emailLinkSignin) {
                        signinMethods.push(state_1.SIGNIN_METHOD_EMAIL_LINK);
                    }
                }
                else if (providerId !== state_1.PROVIDER_PHONE) {
                    allProviders.push(providerId);
                    signinMethods.push(providerId);
                }
            });
        }
    }
    else {
        // We only report if user has password provider sign-in methods. No IDP.
        const user = users.find((u) => u.email);
        if (user) {
            registered = true;
            if (user.passwordHash || user.emailLinkSignin) {
                allProviders.push(state_1.PROVIDER_PASSWORD);
                if (users[0].passwordHash) {
                    signinMethods.push(state_1.PROVIDER_PASSWORD);
                }
                if (users[0].emailLinkSignin) {
                    signinMethods.push(state_1.SIGNIN_METHOD_EMAIL_LINK);
                }
            }
        }
    }
    if (state.enableImprovedEmailPrivacy) {
        return {
            kind: "identitytoolkit#CreateAuthUriResponse",
            sessionId,
        };
    }
    else {
        return {
            kind: "identitytoolkit#CreateAuthUriResponse",
            registered,
            allProviders,
            sessionId,
            signinMethods,
        };
    }
}
const SESSION_COOKIE_MIN_VALID_DURATION = 5 * 60; /* 5 minutes in seconds */
exports.SESSION_COOKIE_MAX_VALID_DURATION = 14 * 24 * 60 * 60; /* 14 days in seconds */
function createSessionCookie(state, reqBody) {
    (0, errors_1.assert)(reqBody.idToken, "MISSING_ID_TOKEN");
    const validDuration = Number(reqBody.validDuration) || exports.SESSION_COOKIE_MAX_VALID_DURATION;
    (0, errors_1.assert)(validDuration >= SESSION_COOKIE_MIN_VALID_DURATION &&
        validDuration <= exports.SESSION_COOKIE_MAX_VALID_DURATION, "INVALID_DURATION");
    const { payload } = parseIdToken(state, reqBody.idToken);
    const issuedAt = (0, utils_1.toUnixTimestamp)(new Date());
    const expiresAt = issuedAt + validDuration;
    const sessionCookie = (0, jsonwebtoken_1.sign)({
        ...payload,
        iat: issuedAt,
        exp: expiresAt,
        iss: `https://session.firebase.google.com/${payload.aud}`,
    }, "fake-secret", {
        // Generate a unsigned (insecure) JWT. Admin SDKs should treat this like
        // a real token (if in emulator mode). This won't work in production.
        algorithm: "none",
    });
    return { sessionCookie };
}
function deleteAccount(state, reqBody, ctx) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    let user;
    if (ctx.security?.Oauth2) {
        (0, errors_1.assert)(reqBody.localId, "MISSING_LOCAL_ID");
        const maybeUser = state.getUserByLocalId(reqBody.localId);
        (0, errors_1.assert)(maybeUser, "USER_NOT_FOUND");
        user = maybeUser;
    }
    else {
        (0, errors_1.assert)(reqBody.idToken, "MISSING_ID_TOKEN");
        user = parseIdToken(state, reqBody.idToken).user;
    }
    state.deleteUser(user);
    return {
        kind: "identitytoolkit#DeleteAccountResponse",
    };
}
function getProjects(state) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(state instanceof state_1.AgentProjectState, "UNSUPPORTED_TENANT_OPERATION");
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
function getRecaptchaParams(state) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    return {
        kind: "identitytoolkit#GetRecaptchaParamResponse",
        // These strings have the same length and character set as real tokens/keys
        // but are clearly fake to human eyes. This should help troubleshooting
        // issues caused by sending these to the real Recaptcha service backend.
        // Clients, such as Firebase SDKs, MUST disable Recaptcha when communicating
        // with the emulator. DO NOT rely on / parse the exact values below.
        recaptchaStoken: "This-is-a-fake-token__Dont-send-this-to-the-Recaptcha-service__The-Auth-Emulator-does-not-support-Recaptcha",
        recaptchaSiteKey: "Fake-key__Do-not-send-this-to-Recaptcha_",
    };
}
function queryAccounts(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    if (reqBody.expression?.length) {
        throw new errors_1.NotImplementedError("expression is not implemented.");
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
        throw new errors_1.NotImplementedError("limit is not implemented.");
    }
    reqBody.offset = reqBody.offset || "0";
    if (reqBody.offset !== "0") {
        throw new errors_1.NotImplementedError("offset is not implemented.");
    }
    if (!reqBody.order || reqBody.order === "ORDER_UNSPECIFIED") {
        reqBody.order = "ASC";
    }
    if (!reqBody.sortBy || reqBody.sortBy === "SORT_BY_FIELD_UNSPECIFIED") {
        reqBody.sortBy = "USER_ID";
    }
    let sortByField;
    if (reqBody.sortBy === "USER_ID") {
        sortByField = "localId";
    }
    else {
        throw new errors_1.NotImplementedError("Only sorting by USER_ID is implemented.");
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
function resetPassword(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(state.allowPasswordSignup, "PASSWORD_LOGIN_DISABLED");
    (0, errors_1.assert)(reqBody.oobCode, "MISSING_OOB_CODE");
    const oob = state.validateOobCode(reqBody.oobCode);
    (0, errors_1.assert)(oob, "INVALID_OOB_CODE");
    if (reqBody.newPassword) {
        (0, errors_1.assert)(oob.requestType === "PASSWORD_RESET", "INVALID_OOB_CODE");
        (0, errors_1.assert)(reqBody.newPassword.length >= PASSWORD_MIN_LENGTH, `WEAK_PASSWORD : Password should be at least ${PASSWORD_MIN_LENGTH} characters`);
        state.deleteOobCode(reqBody.oobCode);
        let user = state.getUserByEmail(oob.email);
        (0, errors_1.assert)(user, "INVALID_OOB_CODE");
        const salt = "fakeSalt" + (0, utils_1.randomId)(20);
        const passwordHash = hashPassword(reqBody.newPassword, salt);
        user = state.updateUserByLocalId(user.localId, {
            emailVerified: true,
            passwordHash,
            salt,
            passwordUpdatedAt: Date.now(),
            validSince: (0, utils_1.toUnixTimestamp)(new Date()).toString(),
        }, { deleteProviders: user.providerUserInfo?.map((info) => info.providerId) });
    }
    return {
        kind: "identitytoolkit#ResetPasswordResponse",
        requestType: oob.requestType,
        // Do not reveal the email when inspecting an email sign-in oobCode.
        // Instead, the client must provide email (e.g. by asking the user)
        // when they call the emailLinkSignIn endpoint.
        // See: https://firebase.google.com/docs/auth/web/email-link-auth#security_concerns
        email: oob.requestType === "EMAIL_SIGNIN" ? undefined : oob.email,
        newEmail: oob.newEmail,
    };
}
exports.resetPassword = resetPassword;
function sendOobCode(state, reqBody, ctx) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(reqBody.requestType && reqBody.requestType !== "OOB_REQ_TYPE_UNSPECIFIED", "MISSING_REQ_TYPE");
    if (reqBody.returnOobLink) {
        (0, errors_1.assert)(ctx.security?.Oauth2, "INSUFFICIENT_PERMISSION");
    }
    if (reqBody.continueUrl) {
        (0, errors_1.assert)((0, utils_1.parseAbsoluteUri)(reqBody.continueUrl), "INVALID_CONTINUE_URI : ((expected an absolute URI with valid scheme and host))");
    }
    let email;
    let newEmail;
    let mode;
    switch (reqBody.requestType) {
        case "EMAIL_SIGNIN":
            (0, errors_1.assert)(state.enableEmailLinkSignin, "OPERATION_NOT_ALLOWED");
            mode = "signIn";
            (0, errors_1.assert)(reqBody.email, "MISSING_EMAIL");
            email = (0, utils_1.canonicalizeEmailAddress)(reqBody.email);
            break;
        case "PASSWORD_RESET":
            mode = "resetPassword";
            (0, errors_1.assert)(reqBody.email, "MISSING_EMAIL");
            email = (0, utils_1.canonicalizeEmailAddress)(reqBody.email);
            const maybeUser = state.getUserByEmail(email);
            if (state.enableImprovedEmailPrivacy && !maybeUser) {
                return {
                    kind: "identitytoolkit#GetOobConfirmationCodeResponse",
                    email,
                };
            }
            (0, errors_1.assert)(maybeUser, "EMAIL_NOT_FOUND");
            break;
        case "VERIFY_EMAIL":
            mode = "verifyEmail";
            // Matching production behavior, reqBody.returnOobLink is used as a signal
            // for Admin usage (instead of whether request is OAuth 2 authenticated.)
            if (reqBody.returnOobLink && !reqBody.idToken) {
                (0, errors_1.assert)(reqBody.email, "MISSING_EMAIL");
                email = (0, utils_1.canonicalizeEmailAddress)(reqBody.email);
                const maybeUser = state.getUserByEmail(email);
                (0, errors_1.assert)(maybeUser, "USER_NOT_FOUND");
            }
            else {
                // Get the user from idToken, reqBody.email is ignored.
                const user = parseIdToken(state, reqBody.idToken || "").user;
                (0, errors_1.assert)(user.email, "MISSING_EMAIL");
                email = user.email;
            }
            break;
        case "VERIFY_AND_CHANGE_EMAIL":
            mode = "verifyAndChangeEmail";
            (0, errors_1.assert)(reqBody.newEmail, "MISSING_NEW_EMAIL");
            newEmail = (0, utils_1.canonicalizeEmailAddress)(reqBody.newEmail);
            if (reqBody.returnOobLink && !reqBody.idToken) {
                (0, errors_1.assert)(reqBody.email, "MISSING_EMAIL");
                email = (0, utils_1.canonicalizeEmailAddress)(reqBody.email);
                const maybeUser = state.getUserByEmail(email);
                (0, errors_1.assert)(maybeUser, "USER_NOT_FOUND");
            }
            else {
                (0, errors_1.assert)(reqBody.idToken, "MISSING_ID_TOKEN");
                const user = parseIdToken(state, reqBody.idToken).user;
                (0, errors_1.assert)(user.email, "MISSING_EMAIL");
                email = user.email;
            }
            (0, errors_1.assert)(!state.getUserByEmail(newEmail), "EMAIL_EXISTS");
            break;
        default:
            throw new errors_1.NotImplementedError(reqBody.requestType);
    }
    if (reqBody.canHandleCodeInApp) {
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("WARN", "canHandleCodeInApp is unsupported in Auth Emulator. All OOB operations will complete via web.");
    }
    const url = (0, utils_1.authEmulatorUrl)(ctx.req);
    const oobRecord = createOobRecord(state, email, url, {
        requestType: reqBody.requestType,
        mode,
        continueUrl: reqBody.continueUrl,
        newEmail,
    });
    if (reqBody.returnOobLink) {
        return {
            kind: "identitytoolkit#GetOobConfirmationCodeResponse",
            email,
            oobCode: oobRecord.oobCode,
            oobLink: oobRecord.oobLink,
        };
    }
    else {
        logOobMessage(oobRecord);
        return {
            kind: "identitytoolkit#GetOobConfirmationCodeResponse",
            email,
        };
    }
}
function sendVerificationCode(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(state instanceof state_1.AgentProjectState, "UNSUPPORTED_TENANT_OPERATION");
    // reqBody.iosReceipt, iosSecret, and recaptchaToken are intentionally ignored.
    // Production Firebase Auth service also throws INVALID_PHONE_NUMBER instead
    // of MISSING_XXXX when phoneNumber is missing. Matching the behavior here.
    (0, errors_1.assert)(reqBody.phoneNumber && (0, utils_1.isValidPhoneNumber)(reqBody.phoneNumber), "INVALID_PHONE_NUMBER : Invalid format.");
    const user = state.getUserByPhoneNumber(reqBody.phoneNumber);
    (0, errors_1.assert)(!user?.mfaInfo?.length, "UNSUPPORTED_FIRST_FACTOR : A phone number cannot be set as a first factor on an SMS based MFA user.");
    const { sessionInfo, phoneNumber, code } = state.createVerificationCode(reqBody.phoneNumber);
    // Print out a developer-friendly log containing the link, in lieu of sending
    // a real text message out to the phone number.
    emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("BULLET", `To verify the phone number ${phoneNumber}, use the code ${code}.`);
    return {
        sessionInfo,
    };
}
function setAccountInfo(state, reqBody, ctx) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    const url = (0, utils_1.authEmulatorUrl)(ctx.req);
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
function setAccountInfoImpl(state, reqBody, { privileged = false, emulatorUrl = undefined } = {}) {
    // TODO: Implement these.
    const unimplementedFields = ["provider", "upgradeToFederatedLogin"];
    for (const field of unimplementedFields) {
        if (field in reqBody) {
            throw new errors_1.NotImplementedError(`${field} is not implemented yet.`);
        }
    }
    if (!privileged) {
        (0, errors_1.assert)(reqBody.idToken || reqBody.oobCode, "INVALID_REQ_TYPE : Unsupported request parameters.");
        (0, errors_1.assert)(reqBody.customAttributes == null, "INSUFFICIENT_PERMISSION");
    }
    else {
        (0, errors_1.assert)(reqBody.localId, "MISSING_LOCAL_ID");
    }
    if (reqBody.customAttributes) {
        validateSerializedCustomClaims(reqBody.customAttributes);
    }
    reqBody.deleteAttribute = reqBody.deleteAttribute || [];
    for (const attr of reqBody.deleteAttribute) {
        if (attr === "PROVIDER" || attr === "RAW_USER_INFO") {
            throw new errors_1.NotImplementedError(`deleteAttribute: ${attr}`);
        }
    }
    const updates = {};
    let user;
    let signInProvider;
    let isEmailUpdate = false;
    let newEmail;
    if (reqBody.oobCode) {
        const oob = state.validateOobCode(reqBody.oobCode);
        (0, errors_1.assert)(oob, "INVALID_OOB_CODE");
        switch (oob.requestType) {
            case "VERIFY_EMAIL": {
                state.deleteOobCode(reqBody.oobCode);
                signInProvider = state_1.PROVIDER_PASSWORD;
                const maybeUser = state.getUserByEmail(oob.email);
                (0, errors_1.assert)(maybeUser, "INVALID_OOB_CODE");
                user = maybeUser;
                updates.emailVerified = true;
                if (oob.email !== user.email) {
                    updates.email = oob.email;
                }
                break;
            }
            case "VERIFY_AND_CHANGE_EMAIL":
                state.deleteOobCode(reqBody.oobCode);
                const maybeUser = state.getUserByEmail(oob.email);
                (0, errors_1.assert)(maybeUser, "INVALID_OOB_CODE");
                (0, errors_1.assert)(oob.newEmail, "INVALID_OOB_CODE");
                (0, errors_1.assert)(!state.getUserByEmail(oob.newEmail), "EMAIL_EXISTS");
                user = maybeUser;
                if (oob.newEmail !== user.email) {
                    updates.email = oob.newEmail;
                    updates.emailVerified = true;
                    newEmail = oob.newEmail;
                }
                break;
            case "RECOVER_EMAIL": {
                state.deleteOobCode(reqBody.oobCode);
                const maybeUser = state.getUserByInitialEmail(oob.email);
                (0, errors_1.assert)(maybeUser, "INVALID_OOB_CODE");
                // Assert that we don't have any user with this initialEmail
                (0, errors_1.assert)(!state.getUserByEmail(oob.email), "EMAIL_EXISTS");
                user = maybeUser;
                if (oob.email !== user.email) {
                    updates.email = oob.email;
                    // Consider email verified, since this flow is initiated from the user's email
                    updates.emailVerified = true;
                }
                break;
            }
            default:
                throw new errors_1.NotImplementedError(oob.requestType);
        }
    }
    else {
        if (reqBody.idToken) {
            ({ user, signInProvider } = parseIdToken(state, reqBody.idToken));
            (0, errors_1.assert)(reqBody.disableUser == null, "OPERATION_NOT_ALLOWED");
        }
        else {
            (0, errors_1.assert)(reqBody.localId, "MISSING_LOCAL_ID");
            const maybeUser = state.getUserByLocalId(reqBody.localId);
            (0, errors_1.assert)(maybeUser, "USER_NOT_FOUND");
            user = maybeUser;
        }
        if (reqBody.email) {
            (0, errors_1.assert)((0, utils_1.isValidEmailAddress)(reqBody.email), "INVALID_EMAIL");
            newEmail = (0, utils_1.canonicalizeEmailAddress)(reqBody.email);
            if (newEmail !== user.email) {
                (0, errors_1.assert)(!state.getUserByEmail(newEmail), "EMAIL_EXISTS");
                updates.email = newEmail;
                // TODO: Set verified if email is verified by IDP linked to account.
                updates.emailVerified = false;
                isEmailUpdate = true;
                // Only update initial email if the user is not anonymous and does not have an initial email.
                // We need to check for an anonymous user through the signIn provider, rather than relying
                // on an empty user.email field, because it is possible for an anonymous user to update their
                // email address through the SetAccountInfo endpoint.
                if (signInProvider !== state_1.PROVIDER_ANONYMOUS && user.email && !user.initialEmail) {
                    updates.initialEmail = user.email;
                }
            }
        }
        if (reqBody.password) {
            (0, errors_1.assert)(reqBody.password.length >= PASSWORD_MIN_LENGTH, `WEAK_PASSWORD : Password should be at least ${PASSWORD_MIN_LENGTH} characters`);
            updates.salt = "fakeSalt" + (0, utils_1.randomId)(20);
            updates.passwordHash = hashPassword(reqBody.password, updates.salt);
            updates.passwordUpdatedAt = Date.now();
            signInProvider = state_1.PROVIDER_PASSWORD;
        }
        if (reqBody.password || reqBody.validSince || updates.email) {
            updates.validSince = (0, utils_1.toUnixTimestamp)(new Date()).toString();
        }
        // if the request specifies an `mfa` key and enrollments are present and non-empty, set the enrollments
        // as the current MFA state for the user. if the `mfa` key is specified and no enrollments are present,
        // clear any existing MFA data for the user. if no `mfa` key is specified, MFA is left unchanged.
        if (reqBody.mfa) {
            if (reqBody.mfa.enrollments && reqBody.mfa.enrollments.length > 0) {
                updates.mfaInfo = getMfaEnrollmentsFromRequest(state, reqBody.mfa.enrollments);
            }
            else {
                updates.mfaInfo = undefined;
            }
        }
        // Copy profile properties to updates, if they're specified.
        const fieldsToCopy = [
            "displayName",
            "photoUrl",
        ];
        if (privileged) {
            if (reqBody.disableUser != null) {
                updates.disabled = reqBody.disableUser;
            }
            if (reqBody.phoneNumber && reqBody.phoneNumber !== user.phoneNumber) {
                (0, errors_1.assert)((0, utils_1.isValidPhoneNumber)(reqBody.phoneNumber), "INVALID_PHONE_NUMBER : Invalid format.");
                (0, errors_1.assert)(!state.getUserByPhoneNumber(reqBody.phoneNumber), "PHONE_NUMBER_EXISTS");
                updates.phoneNumber = reqBody.phoneNumber;
            }
            fieldsToCopy.push("emailVerified", "customAttributes", "createdAt", "lastLoginAt", "validSince");
        }
        for (const field of fieldsToCopy) {
            if (reqBody[field] != null) {
                (0, utils_1.mirrorFieldTo)(updates, field, reqBody);
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
        if (reqBody.deleteProvider?.includes(state_1.PROVIDER_PASSWORD)) {
            updates.email = undefined;
            updates.emailVerified = undefined;
            updates.emailLinkSignin = undefined;
            updates.passwordHash = undefined;
            updates.salt = undefined;
        }
        if (reqBody.deleteProvider?.includes(state_1.PROVIDER_PHONE)) {
            updates.phoneNumber = undefined;
        }
    }
    if (reqBody.linkProviderUserInfo) {
        (0, errors_1.assert)(reqBody.linkProviderUserInfo.providerId, "MISSING_PROVIDER_ID");
        (0, errors_1.assert)(reqBody.linkProviderUserInfo.rawId, "MISSING_RAW_ID");
    }
    user = state.updateUserByLocalId(user.localId, updates, {
        deleteProviders: reqBody.deleteProvider,
        upsertProviders: reqBody.linkProviderUserInfo
            ? [reqBody.linkProviderUserInfo]
            : undefined,
    });
    // Only initiate the recover email OOB flow for non-anonymous users
    if (signInProvider !== state_1.PROVIDER_ANONYMOUS && user.initialEmail && isEmailUpdate) {
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
        newEmail,
        passwordHash: user.passwordHash,
        ...(updates.validSince && signInProvider ? issueTokens(state, user, signInProvider) : {}),
    });
}
exports.setAccountInfoImpl = setAccountInfoImpl;
function sendOobForEmailReset(state, initialEmail, url) {
    const oobRecord = createOobRecord(state, initialEmail, url, {
        requestType: "RECOVER_EMAIL",
        mode: "recoverEmail",
    });
    // Print out a developer-friendly log
    logOobMessage(oobRecord);
}
function createOobRecord(state, email, url, params) {
    const oobRecord = state.createOob(email, params.newEmail, params.requestType, (oobCode) => {
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
        if (state instanceof state_1.TenantProjectState) {
            url.searchParams.set("tenantId", state.tenantId);
        }
        return url.toString();
    });
    return oobRecord;
}
function logOobMessage(oobRecord) {
    const oobLink = oobRecord.oobLink;
    const email = oobRecord.email;
    // Generate a developer-friendly log containing the link, in lieu of
    // sending a real email out to the email address.
    let maybeMessage;
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
        case "VERIFY_AND_CHANGE_EMAIL":
            maybeMessage = `To verify and change the email address from ${email} to ${oobRecord.newEmail}, follow this link: ${oobLink}`;
            break;
        case "RECOVER_EMAIL":
            maybeMessage = `To reset your email address to ${email}, follow this link: ${oobLink}`;
            break;
    }
    if (maybeMessage) {
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("BULLET", maybeMessage);
    }
}
function signInWithCustomToken(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(reqBody.token, "MISSING_CUSTOM_TOKEN");
    let payload;
    if (reqBody.token.startsWith("{")) {
        // In the emulator only, we allow plain JSON strings as custom tokens, to
        // simplify testing. This won't work in production.
        try {
            payload = JSON.parse(reqBody.token);
        }
        catch {
            throw new errors_1.BadRequestError("INVALID_CUSTOM_TOKEN : ((Auth Emulator only accepts strict JSON or JWTs as fake custom tokens.))");
        }
        // Don't check payload.aud for JSON strings, making them easier to construct.
    }
    else {
        const decoded = (0, jsonwebtoken_1.decode)(reqBody.token, { complete: true });
        if (state instanceof state_1.TenantProjectState) {
            (0, errors_1.assert)(decoded?.payload.tenant_id === state.tenantId, "TENANT_ID_MISMATCH");
        }
        (0, errors_1.assert)(decoded, "INVALID_CUSTOM_TOKEN : Invalid assertion format");
        if (decoded.header.alg !== "none") {
            // We may have received a real token, signed using a service account private
            // key, intended for exchange with production Authentication service.
            // As an emulator, we do not have the private key and we will assume it is
            // valid with a warning.
            emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("WARN", "Received a signed custom token. Auth Emulator does not validate JWTs and IS NOT SECURE");
        }
        (0, errors_1.assert)(decoded.payload.aud === exports.CUSTOM_TOKEN_AUDIENCE, `INVALID_CUSTOM_TOKEN : ((Invalid aud (audience): ${decoded.payload.aud} ` +
            "Note: Firebase ID Tokens / third-party tokens cannot be used with signInWithCustomToken.))");
        // We do not verify iss or sub since these are service account emails that
        // we cannot reasonably validate within the emulator.
        // iat (issued at) and exp (expires at) are intentionally unchecked so that
        // developers can keep reusing the same token in their tests.
        payload = decoded.payload;
    }
    const localId = coercePrimitiveToString(payload.uid) ?? coercePrimitiveToString(payload.user_id);
    (0, errors_1.assert)(localId, "MISSING_IDENTIFIER");
    let extraClaims = {};
    if ("claims" in payload) {
        validateCustomClaims(payload.claims);
        extraClaims = payload.claims;
    }
    let user = state.getUserByLocalId(localId);
    const isNewUser = !user;
    const timestamp = new Date();
    const updates = {
        customAuth: true,
        lastLoginAt: timestamp.getTime().toString(),
        tenantId: state instanceof state_1.TenantProjectState ? state.tenantId : undefined,
    };
    if (user) {
        (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
        user = state.updateUserByLocalId(localId, updates);
    }
    else {
        updates.createdAt = timestamp.getTime().toString();
        user = state.createUserWithLocalId(localId, updates);
        if (!user) {
            throw new Error(`Internal assertion error: trying to create duplicate localId: ${localId}`);
        }
    }
    return {
        kind: "identitytoolkit#VerifyCustomTokenResponse",
        isNewUser,
        ...issueTokens(state, user, state_1.PROVIDER_CUSTOM, { extraClaims }),
    };
}
async function signInWithEmailLink(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(state.enableEmailLinkSignin, "OPERATION_NOT_ALLOWED");
    const userFromIdToken = reqBody.idToken ? parseIdToken(state, reqBody.idToken).user : undefined;
    (0, errors_1.assert)(reqBody.email, "MISSING_EMAIL");
    const email = (0, utils_1.canonicalizeEmailAddress)(reqBody.email);
    (0, errors_1.assert)(reqBody.oobCode, "MISSING_OOB_CODE");
    const oob = state.validateOobCode(reqBody.oobCode);
    (0, errors_1.assert)(oob && oob.requestType === "EMAIL_SIGNIN", "INVALID_OOB_CODE");
    (0, errors_1.assert)(email === oob.email, "INVALID_EMAIL : The email provided does not match the sign-in email address.");
    state.deleteOobCode(reqBody.oobCode);
    const userFromEmail = state.getUserByEmail(email);
    let user = userFromIdToken || userFromEmail;
    const isNewUser = !user;
    const timestamp = new Date();
    let updates = {
        email,
        emailVerified: true,
        emailLinkSignin: true,
    };
    if (state instanceof state_1.TenantProjectState) {
        updates.tenantId = state.tenantId;
    }
    let extraClaims;
    if (!user) {
        updates.createdAt = timestamp.getTime().toString();
        const localId = state.generateLocalId();
        const userBeforeCreate = { localId, ...updates };
        const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_CREATE, userBeforeCreate, { signInMethod: "emailLink" });
        updates = { ...updates, ...blockingResponse.updates };
        user = state.createUserWithLocalId(localId, updates);
        if (!user.disabled && !isMfaEnabled(state, user)) {
            const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, user, { signInMethod: "emailLink" });
            updates = blockingResponse.updates;
            extraClaims = blockingResponse.extraClaims;
            user = state.updateUserByLocalId(user.localId, updates);
        }
    }
    else {
        (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
        if (userFromIdToken && userFromEmail) {
            (0, errors_1.assert)(userFromIdToken.localId === userFromEmail.localId, "EMAIL_EXISTS");
        }
        if (!user.disabled && !isMfaEnabled(state, user)) {
            const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, { ...user, ...updates }, { signInMethod: "emailLink" });
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
    (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
    if (isMfaEnabled(state, user)) {
        return { ...response, ...mfaPending(state, user, state_1.PROVIDER_PASSWORD) };
    }
    else {
        user = state.updateUserByLocalId(user.localId, { lastLoginAt: Date.now().toString() });
        return { ...response, ...issueTokens(state, user, state_1.PROVIDER_PASSWORD, { extraClaims }) };
    }
}
async function signInWithIdp(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    if (reqBody.returnRefreshToken) {
        throw new errors_1.NotImplementedError("returnRefreshToken is not implemented yet.");
    }
    if (reqBody.pendingIdToken) {
        throw new errors_1.NotImplementedError("pendingIdToken is not implemented yet.");
    }
    const normalizedUri = getNormalizedUri(reqBody);
    const providerId = normalizedUri.searchParams.get("providerId")?.toLowerCase();
    (0, errors_1.assert)(providerId, `INVALID_CREDENTIAL_OR_PROVIDER_ID : Invalid IdP response/credential: ${normalizedUri.toString()}`);
    const oauthIdToken = normalizedUri.searchParams.get("id_token") || undefined;
    const oauthAccessToken = normalizedUri.searchParams.get("access_token") || undefined;
    const claims = parseClaims(oauthIdToken) || parseClaims(oauthAccessToken);
    if (!claims) {
        // Try to give the most helpful error message, depending on input.
        if (oauthIdToken) {
            throw new errors_1.BadRequestError(`INVALID_IDP_RESPONSE : Unable to parse id_token: ${oauthIdToken} ((Auth Emulator only accepts strict JSON or JWTs as fake id_tokens.))`);
        }
        else if (oauthAccessToken) {
            if (providerId === "google.com" || providerId === "apple.com") {
                throw new errors_1.NotImplementedError(`The Auth Emulator only support sign-in with ${providerId} using id_token, not access_token. Please update your code to use id_token.`);
            }
            else {
                throw new errors_1.NotImplementedError(`The Auth Emulator does not support ${providerId} sign-in with credentials.`);
            }
        }
        else {
            throw new errors_1.NotImplementedError("The Auth Emulator only supports sign-in with credentials (id_token required).");
        }
    }
    // Generic SAML flow
    let samlResponse;
    let signInAttributes = undefined;
    if (normalizedUri.searchParams.get("SAMLResponse")) {
        // Auth emulator purposefully does not parse SAML and expects SAML-related
        // fields to be JSON objects.
        samlResponse = JSON.parse(normalizedUri.searchParams.get("SAMLResponse"));
        signInAttributes = samlResponse.assertion?.attributeStatements;
        (0, errors_1.assert)(samlResponse.assertion, "INVALID_IDP_RESPONSE ((Missing assertion in SAMLResponse.))");
        (0, errors_1.assert)(samlResponse.assertion.subject, "INVALID_IDP_RESPONSE ((Missing assertion.subject in SAMLResponse.))");
        (0, errors_1.assert)(samlResponse.assertion.subject.nameId, "INVALID_IDP_RESPONSE ((Missing assertion.subject.nameId in SAMLResponse.))");
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
    let accountUpdates;
    try {
        if (userFromIdToken) {
            (0, errors_1.assert)(!userMatchingProvider, "FEDERATED_USER_ID_ALREADY_LINKED");
            ({ accountUpdates, response } = handleLinkIdp(state, response, userFromIdToken));
        }
        else if (state.oneAccountPerEmail) {
            const userMatchingEmail = response.email ? state.getUserByEmail(response.email) : undefined;
            ({ accountUpdates, response } = handleIdpSigninEmailRequired(response, rawId, userMatchingProvider, userMatchingEmail));
        }
        else {
            ({ accountUpdates, response } = handleIdpSigninEmailNotRequired(response, userMatchingProvider));
        }
    }
    catch (err) {
        if (reqBody.returnIdpCredential && err instanceof errors_1.BadRequestError) {
            response.errorMessage = err.message;
            return response;
        }
        else {
            throw err;
        }
    }
    if (response.needConfirmation) {
        return response;
    }
    const providerUserInfo = {
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
    let user;
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
        let updates = {
            ...accountUpdates.fields,
            createdAt: timestamp.getTime().toString(),
            lastLoginAt: timestamp.getTime().toString(),
            providerUserInfo: [providerUserInfo],
            tenantId: state instanceof state_1.TenantProjectState ? state.tenantId : undefined,
        };
        const localId = state.generateLocalId();
        const userBeforeCreate = { localId, ...updates };
        const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_CREATE, userBeforeCreate, {
            signInMethod: response.providerId,
            rawUserInfo: response.rawUserInfo,
            signInAttributes: JSON.stringify(signInAttributes),
        }, oauthTokens);
        updates = { ...updates, ...blockingResponse.updates };
        user = state.createUserWithLocalId(localId, updates);
        response.localId = user.localId;
        if (!user.disabled && !isMfaEnabled(state, user)) {
            const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, user, {
                signInMethod: response.providerId,
                rawUserInfo: response.rawUserInfo,
                signInAttributes: JSON.stringify(signInAttributes),
            }, oauthTokens);
            updates = blockingResponse.updates;
            extraClaims = blockingResponse.extraClaims;
            user = state.updateUserByLocalId(user.localId, updates);
        }
    }
    else {
        if (!response.localId) {
            throw new Error("Internal assertion error: localId not set for existing user.");
        }
        const maybeUser = state.getUserByLocalId(response.localId);
        (0, errors_1.assert)(maybeUser, "USER_NOT_FOUND");
        user = maybeUser;
        let updates = { ...accountUpdates.fields };
        if (!user.disabled && !isMfaEnabled(state, user)) {
            const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, { ...user, ...updates }, {
                signInMethod: response.providerId,
                rawUserInfo: response.rawUserInfo,
                signInAttributes: JSON.stringify(signInAttributes),
            }, oauthTokens);
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
    if (state instanceof state_1.TenantProjectState) {
        response.tenantId = state.tenantId;
    }
    if (isMfaEnabled(state, user)) {
        return { ...response, ...mfaPending(state, user, providerId) };
    }
    else {
        user = state.updateUserByLocalId(user.localId, { lastLoginAt: Date.now().toString() });
        // User may have been disabled after either blocking function, but
        // only throw after writing user to store
        (0, errors_1.assert)(!user?.disabled, "USER_DISABLED");
        return {
            ...response,
            ...issueTokens(state, user, providerId, { signInAttributes, extraClaims }),
        };
    }
}
async function signInWithPassword(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(state.allowPasswordSignup, "PASSWORD_LOGIN_DISABLED");
    (0, errors_1.assert)(reqBody.email !== undefined, "MISSING_EMAIL");
    (0, errors_1.assert)((0, utils_1.isValidEmailAddress)(reqBody.email), "INVALID_EMAIL");
    (0, errors_1.assert)(reqBody.password, "MISSING_PASSWORD");
    if (reqBody.captchaResponse || reqBody.captchaChallenge) {
        throw new errors_1.NotImplementedError("captcha unimplemented");
    }
    if (reqBody.idToken || reqBody.pendingIdToken) {
        throw new errors_1.NotImplementedError("idToken / pendingIdToken is no longer in use and unsupported by the Auth Emulator.");
    }
    const email = (0, utils_1.canonicalizeEmailAddress)(reqBody.email);
    let user = state.getUserByEmail(email);
    if (state.enableImprovedEmailPrivacy) {
        (0, errors_1.assert)(user, "INVALID_LOGIN_CREDENTIALS");
        (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
        (0, errors_1.assert)(user.passwordHash && user.salt, "INVALID_LOGIN_CREDENTIALS");
        (0, errors_1.assert)(user.passwordHash === hashPassword(reqBody.password, user.salt), "INVALID_LOGIN_CREDENTIALS");
    }
    else {
        (0, errors_1.assert)(user, "EMAIL_NOT_FOUND");
        (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
        (0, errors_1.assert)(user.passwordHash && user.salt, "INVALID_PASSWORD");
        (0, errors_1.assert)(user.passwordHash === hashPassword(reqBody.password, user.salt), "INVALID_PASSWORD");
    }
    const response = {
        kind: "identitytoolkit#VerifyPasswordResponse",
        registered: true,
        localId: user.localId,
        email,
    };
    if (isMfaEnabled(state, user)) {
        return { ...response, ...mfaPending(state, user, state_1.PROVIDER_PASSWORD) };
    }
    else {
        const { updates, extraClaims } = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, user, { signInMethod: "password" });
        user = state.updateUserByLocalId(user.localId, {
            ...updates,
            lastLoginAt: Date.now().toString(),
        });
        // User may have been disabled after blocking function, but only throw after
        // writing user to store
        (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
        return { ...response, ...issueTokens(state, user, state_1.PROVIDER_PASSWORD, { extraClaims }) };
    }
}
async function signInWithPhoneNumber(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(state instanceof state_1.AgentProjectState, "UNSUPPORTED_TENANT_OPERATION");
    let phoneNumber;
    if (reqBody.temporaryProof) {
        (0, errors_1.assert)(reqBody.phoneNumber, "MISSING_PHONE_NUMBER");
        const proof = state.validateTemporaryProof(reqBody.temporaryProof, reqBody.phoneNumber);
        (0, errors_1.assert)(proof, "INVALID_TEMPORARY_PROOF");
        ({ phoneNumber } = proof);
    }
    else {
        (0, errors_1.assert)(reqBody.sessionInfo, "MISSING_SESSION_INFO");
        (0, errors_1.assert)(reqBody.code, "MISSING_CODE");
        phoneNumber = verifyPhoneNumber(state, reqBody.sessionInfo, reqBody.code);
    }
    const userFromPhoneNumber = state.getUserByPhoneNumber(phoneNumber);
    const userFromIdToken = reqBody.idToken ? parseIdToken(state, reqBody.idToken).user : undefined;
    if (userFromPhoneNumber && userFromIdToken) {
        if (userFromPhoneNumber.localId !== userFromIdToken.localId) {
            (0, errors_1.assert)(!reqBody.temporaryProof, "PHONE_NUMBER_EXISTS");
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
    let updates = {
        phoneNumber,
        lastLoginAt: timestamp.getTime().toString(),
    };
    let extraClaims;
    if (!user) {
        updates.createdAt = timestamp.getTime().toString();
        const localId = state.generateLocalId();
        const userBeforeCreate = { localId, ...updates };
        const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_CREATE, userBeforeCreate, { signInMethod: "phone" });
        updates = { ...updates, ...blockingResponse.updates };
        user = state.createUserWithLocalId(localId, updates);
        if (!user.disabled) {
            const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, user, { signInMethod: "phone" });
            updates = blockingResponse.updates;
            extraClaims = blockingResponse.extraClaims;
            user = state.updateUserByLocalId(user.localId, updates);
        }
    }
    else {
        (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
        (0, errors_1.assert)(!user.mfaInfo?.length, "UNSUPPORTED_FIRST_FACTOR : A phone number cannot be set as a first factor on an SMS based MFA user.");
        if (!user.disabled) {
            const blockingResponse = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, { ...user, ...updates }, { signInMethod: "phone" });
            updates = { ...updates, ...blockingResponse.updates };
            extraClaims = blockingResponse.extraClaims;
        }
        user = state.updateUserByLocalId(user.localId, updates);
    }
    // User may have been disabled after either blocking function, but
    // only throw after writing user to store
    (0, errors_1.assert)(!user?.disabled, "USER_DISABLED");
    const tokens = issueTokens(state, user, state_1.PROVIDER_PHONE, {
        extraClaims,
    });
    return {
        isNewUser,
        phoneNumber,
        localId: user.localId,
        ...tokens,
    };
}
function grantToken(state, reqBody) {
    // https://developers.google.com/identity/toolkit/reference/securetoken/rest/v1/token
    // reqBody.code is intentionally ignored.
    (0, errors_1.assert)(reqBody.grantType, "MISSING_GRANT_TYPE");
    (0, errors_1.assert)(reqBody.grantType === "refresh_token", "INVALID_GRANT_TYPE");
    (0, errors_1.assert)(reqBody.refreshToken, "MISSING_REFRESH_TOKEN");
    const refreshTokenRecord = state.validateRefreshToken(reqBody.refreshToken);
    (0, errors_1.assert)(!refreshTokenRecord.user.disabled, "USER_DISABLED");
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
function deleteAllAccountsInProject(state) {
    state.deleteAllAccounts();
    return {};
}
function getEmulatorProjectConfig(state) {
    return {
        signIn: {
            allowDuplicateEmails: !state.oneAccountPerEmail,
        },
        emailPrivacyConfig: {
            enableImprovedEmailPrivacy: state.enableImprovedEmailPrivacy,
        },
    };
}
function updateEmulatorProjectConfig(state, reqBody, ctx) {
    // New developers should not use updateEmulatorProjectConfig to update the
    // allowDuplicateEmails setting and should instead use updateConfig to do so.
    const updateMask = [];
    if (reqBody.signIn?.allowDuplicateEmails != null) {
        updateMask.push("signIn.allowDuplicateEmails");
    }
    if (reqBody.emailPrivacyConfig?.enableImprovedEmailPrivacy != null) {
        updateMask.push("emailPrivacyConfig.enableImprovedEmailPrivacy");
    }
    ctx.params.query.updateMask = updateMask.join();
    updateConfig(state, reqBody, ctx);
    return getEmulatorProjectConfig(state);
}
function listOobCodesInProject(state) {
    return {
        oobCodes: [...state.listOobCodes()],
    };
}
function listVerificationCodesInProject(state) {
    return {
        verificationCodes: [...state.listVerificationCodes()],
    };
}
function mfaEnrollmentStart(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)((state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
        state.mfaConfig.enabledProviders?.includes("PHONE_SMS"), "OPERATION_NOT_ALLOWED : SMS based MFA not enabled.");
    (0, errors_1.assert)(reqBody.idToken, "MISSING_ID_TOKEN");
    const { user, signInProvider } = parseIdToken(state, reqBody.idToken);
    (0, errors_1.assert)(!MFA_INELIGIBLE_PROVIDER.has(signInProvider), "UNSUPPORTED_FIRST_FACTOR : MFA is not available for the given first factor.");
    (0, errors_1.assert)(user.emailVerified, "UNVERIFIED_EMAIL : Need to verify email first before enrolling second factors.");
    (0, errors_1.assert)(reqBody.phoneEnrollmentInfo, "INVALID_ARGUMENT : ((Missing phoneEnrollmentInfo.))");
    // recaptchaToken, safetyNetToken, iosReceipt, and iosSecret are intentionally
    // ignored because the emulator doesn't implement anti-abuse features.
    // autoRetrievalInfo is ignored because SMS will not actually be sent.
    const phoneNumber = reqBody.phoneEnrollmentInfo.phoneNumber;
    // Production Firebase Auth service also throws INVALID_PHONE_NUMBER instead
    // of MISSING_XXXX when phoneNumber is missing. Matching the behavior here.
    (0, errors_1.assert)(phoneNumber && (0, utils_1.isValidPhoneNumber)(phoneNumber), "INVALID_PHONE_NUMBER : Invalid format.");
    (0, errors_1.assert)(!user.mfaInfo?.some((enrollment) => enrollment.unobfuscatedPhoneInfo === phoneNumber), "SECOND_FACTOR_EXISTS : Phone number already enrolled as second factor for this account.");
    const { sessionInfo, code } = state.createVerificationCode(phoneNumber);
    // Print out a developer-friendly log containing the link, in lieu of sending
    // a real text message out to the phone number.
    emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("BULLET", `To enroll MFA with ${phoneNumber}, use the code ${code}.`);
    return {
        phoneSessionInfo: {
            sessionInfo,
        },
    };
}
function mfaEnrollmentFinalize(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)((state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
        state.mfaConfig.enabledProviders?.includes("PHONE_SMS"), "OPERATION_NOT_ALLOWED : SMS based MFA not enabled.");
    (0, errors_1.assert)(reqBody.idToken, "MISSING_ID_TOKEN");
    let { user, signInProvider } = parseIdToken(state, reqBody.idToken);
    (0, errors_1.assert)(!MFA_INELIGIBLE_PROVIDER.has(signInProvider), "UNSUPPORTED_FIRST_FACTOR : MFA is not available for the given first factor.");
    (0, errors_1.assert)(reqBody.phoneVerificationInfo, "INVALID_ARGUMENT : ((Missing phoneVerificationInfo.))");
    if (reqBody.phoneVerificationInfo.androidVerificationProof) {
        throw new errors_1.NotImplementedError("androidVerificationProof is unsupported!");
    }
    const { code, sessionInfo } = reqBody.phoneVerificationInfo;
    (0, errors_1.assert)(code, "MISSING_CODE");
    (0, errors_1.assert)(sessionInfo, "MISSING_SESSION_INFO");
    const phoneNumber = verifyPhoneNumber(state, sessionInfo, code);
    (0, errors_1.assert)(!user.mfaInfo?.some((enrollment) => enrollment.unobfuscatedPhoneInfo === phoneNumber), "SECOND_FACTOR_EXISTS : Phone number already enrolled as second factor for this account.");
    const existingFactors = user.mfaInfo || [];
    const existingIds = new Set();
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
        secondFactor: { identifier: enrollment.mfaEnrollmentId, provider: state_1.PROVIDER_PHONE },
    });
    return {
        idToken,
        refreshToken,
    };
}
function mfaEnrollmentWithdraw(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)(reqBody.idToken, "MISSING_ID_TOKEN");
    let { user, signInProvider } = parseIdToken(state, reqBody.idToken);
    (0, errors_1.assert)(user.mfaInfo, "MFA_ENROLLMENT_NOT_FOUND");
    const updatedList = user.mfaInfo.filter((enrollment) => enrollment.mfaEnrollmentId !== reqBody.mfaEnrollmentId);
    (0, errors_1.assert)(updatedList.length < user.mfaInfo.length, "MFA_ENROLLMENT_NOT_FOUND");
    user = state.updateUserByLocalId(user.localId, { mfaInfo: updatedList });
    return {
        ...issueTokens(state, user, signInProvider),
    };
}
function mfaSignInStart(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)((state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
        state.mfaConfig.enabledProviders?.includes("PHONE_SMS"), "OPERATION_NOT_ALLOWED : SMS based MFA not enabled.");
    (0, errors_1.assert)(reqBody.mfaPendingCredential, "MISSING_MFA_PENDING_CREDENTIAL : Request does not have MFA pending credential.");
    (0, errors_1.assert)(reqBody.mfaEnrollmentId, "MISSING_MFA_ENROLLMENT_ID : No second factor identifier is provided.");
    // In production, reqBody.phoneSignInInfo must be set to indicate phone-based
    // MFA. However, we don't enforce this because none of its fields are required
    // in the emulator. e.g. recaptchaToken/safetyNetToken doesn't make sense;
    const { user } = parsePendingCredential(state, reqBody.mfaPendingCredential);
    const enrollment = user.mfaInfo?.find((factor) => factor.mfaEnrollmentId === reqBody.mfaEnrollmentId);
    (0, errors_1.assert)(enrollment, "MFA_ENROLLMENT_NOT_FOUND");
    const phoneNumber = enrollment.unobfuscatedPhoneInfo;
    (0, errors_1.assert)(phoneNumber, "INVALID_ARGUMENT : MFA provider not supported!");
    const { sessionInfo, code } = state.createVerificationCode(phoneNumber);
    // Print out a developer-friendly log containing the link, in lieu of sending
    // a real text message out to the phone number.
    emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("BULLET", `To sign in with MFA using ${phoneNumber}, use the code ${code}.`);
    return {
        phoneResponseInfo: {
            sessionInfo,
        },
    };
}
async function mfaSignInFinalize(state, reqBody) {
    (0, errors_1.assert)(!state.disableAuth, "PROJECT_DISABLED");
    (0, errors_1.assert)((state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
        state.mfaConfig.enabledProviders?.includes("PHONE_SMS"), "OPERATION_NOT_ALLOWED : SMS based MFA not enabled.");
    // Inconsistent with mfaSignInStart (where MISSING_MFA_PENDING_CREDENTIAL is
    // returned), but matches production behavior.
    (0, errors_1.assert)(reqBody.mfaPendingCredential, "MISSING_CREDENTIAL : Please set MFA Pending Credential.");
    (0, errors_1.assert)(reqBody.phoneVerificationInfo, "INVALID_ARGUMENT : MFA provider not supported!");
    if (reqBody.phoneVerificationInfo.androidVerificationProof) {
        throw new errors_1.NotImplementedError("androidVerificationProof is unsupported!");
    }
    const { code, sessionInfo } = reqBody.phoneVerificationInfo;
    (0, errors_1.assert)(code, "MISSING_CODE");
    (0, errors_1.assert)(sessionInfo, "MISSING_SESSION_INFO");
    const phoneNumber = verifyPhoneNumber(state, sessionInfo, code);
    let { user, signInProvider } = parsePendingCredential(state, reqBody.mfaPendingCredential);
    const enrollment = user.mfaInfo?.find((enrollment) => {
        // All but firebase-ios-sdk finalize with unobfuscated phone number.
        if (enrollment.unobfuscatedPhoneInfo === phoneNumber) {
            return true;
        }
        // But firebase-ios-sdk finalizes with an obfuscated number. This works against
        // cloud auth, so emulator should attempt to find enrollment obfuscated as well.
        if (!!enrollment.unobfuscatedPhoneInfo &&
            obfuscatePhoneNumber(enrollment.unobfuscatedPhoneInfo) === phoneNumber) {
            return true;
        }
        return false;
    });
    const { updates, extraClaims } = await fetchBlockingFunction(state, state_1.BlockingFunctionEvents.BEFORE_SIGN_IN, user, { signInMethod: signInProvider, signInSecondFactor: "phone" });
    user = state.updateUserByLocalId(user.localId, {
        ...updates,
        lastLoginAt: Date.now().toString(),
    });
    (0, errors_1.assert)(enrollment && enrollment.mfaEnrollmentId, "MFA_ENROLLMENT_NOT_FOUND");
    // User may have been disabled after blocking function, but only throw after
    // writing user to store
    (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
    const { idToken, refreshToken } = issueTokens(state, user, signInProvider, {
        extraClaims,
        secondFactor: { identifier: enrollment.mfaEnrollmentId, provider: state_1.PROVIDER_PHONE },
    });
    return {
        idToken,
        refreshToken,
    };
}
function getConfig(state) {
    // Shouldn't error on this but need assertion for type checking
    (0, errors_1.assert)(state instanceof state_1.AgentProjectState, "((Can only get top-level configurations on agent projects.))");
    return state.config;
}
function updateConfig(state, reqBody, ctx) {
    (0, errors_1.assert)(state instanceof state_1.AgentProjectState, "((Can only update top-level configurations on agent projects.))");
    for (const event in reqBody.blockingFunctions?.triggers) {
        if (Object.prototype.hasOwnProperty.call(reqBody.blockingFunctions.triggers, event)) {
            (0, errors_1.assert)(Object.values(state_1.BlockingFunctionEvents).includes(event), "INVALID_BLOCKING_FUNCTION : ((Event type is invalid.))");
            (0, errors_1.assert)((0, utils_1.parseAbsoluteUri)(reqBody.blockingFunctions.triggers[event].functionUri), "INVALID_BLOCKING_FUNCTION : ((Expected an absolute URI with valid scheme and host.))");
        }
    }
    return state.updateConfig(reqBody, ctx.params.query.updateMask);
}
function coercePrimitiveToString(value) {
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
function redactPasswordHash(user) {
    // In production, salt will be removed and passwordHash will be set to
    // "UkVEQUNURUQ=" (i.e. "REDACTED" in base64), unless exporting users.
    // The emulator does NOT do that, allowing easier inspection (e.g. in tests).
    // Developers should not put real secrets in the Auth Emulator anyway.
    return user;
}
function hashPassword(password, salt) {
    // We don't actually hash passwords because this is an emulator.
    // Secrets should not be entered at all here and let's not give
    // people a fake sense of security.
    return `fakeHash:salt=${salt}:password=${password}`;
}
function issueTokens(state, user, signInProvider, { extraClaims, secondFactor, signInAttributes, } = {}) {
    user = state.updateUserByLocalId(user.localId, { lastRefreshAt: new Date().toISOString() });
    const tenantId = state instanceof state_1.TenantProjectState ? state.tenantId : undefined;
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
function parseIdToken(state, idToken) {
    const decoded = (0, jsonwebtoken_1.decode)(idToken, { complete: true });
    (0, errors_1.assert)(decoded, "INVALID_ID_TOKEN");
    if (decoded.header.alg !== "none") {
        // This emulator itself never generates secure JWTs, so reaching here
        // probably means somehow a production auth token was sent to it.
        // Since the emulator does not have private keys or any other means of
        // validating the JWT, we'll just proceed with a warning. But the
        // request will most likely fail below with USER_NOT_FOUND.
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("WARN", "Received a signed JWT. Auth Emulator does not validate JWTs and IS NOT SECURE");
    }
    if (decoded.payload.firebase.tenant) {
        (0, errors_1.assert)(state instanceof state_1.TenantProjectState, "((Parsed token that belongs to tenant in a non-tenant project.))");
        (0, errors_1.assert)(decoded.payload.firebase.tenant === state.tenantId, "TENANT_ID_MISMATCH");
    }
    const user = state.getUserByLocalId(decoded.payload.user_id);
    (0, errors_1.assert)(user, "USER_NOT_FOUND");
    // To make interactive debugging easier, idTokens in the emulator never expire
    // due to the passage of time (exp unchecked) but they may still be _revoked_:
    (0, errors_1.assert)(!user.validSince || decoded.payload.iat >= Number(user.validSince), "TOKEN_EXPIRED");
    (0, errors_1.assert)(!user.disabled, "USER_DISABLED");
    const signInProvider = decoded.payload.firebase.sign_in_provider;
    return { user, signInProvider, payload: decoded.payload };
}
function generateJwt(user, { projectId, signInProvider, expiresInSeconds, extraClaims = {}, secondFactor, tenantId, signInAttributes, }) {
    const identities = {};
    if (user.email) {
        identities["email"] = [user.email];
    }
    if (user.providerUserInfo) {
        for (const providerInfo of user.providerUserInfo) {
            if (providerInfo.providerId &&
                providerInfo.providerId !== state_1.PROVIDER_PASSWORD &&
                providerInfo.rawId) {
                const ids = identities[providerInfo.providerId] || [];
                ids.push(providerInfo.rawId);
                identities[providerInfo.providerId] = ids;
            }
        }
    }
    const customAttributes = JSON.parse(user.customAttributes || "{}");
    const customPayloadFields = {
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
        auth_time: (0, utils_1.toUnixTimestamp)(getAuthTime(user)),
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
    const jwtStr = (0, jsonwebtoken_1.sign)(customPayloadFields, 
    // secretOrPrivateKey is required for jsonwebtoken v9, see
    // https://github.com/auth0/node-jsonwebtoken/wiki/Migration-Notes:-v8-to-v9
    // Tokens generated by the auth emulator are intentionally insecure and are
    // not meant to be used in production. Thus, a fake secret is used here.
    "fake-secret", {
        // Generate a unsigned (insecure) JWT. This is accepted by many other
        // emulators (e.g. Cloud Firestore Emulator) but will not work in
        // production of course. This removes the need to sign / verify tokens.
        algorithm: "none",
        expiresIn: expiresInSeconds,
        subject: user.localId,
        // TODO: Should this point to an emulator URL?
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
    });
    return jwtStr;
}
function getAuthTime(user) {
    if (user.lastLoginAt != null) {
        const millisSinceEpoch = parseInt(user.lastLoginAt, 10);
        const authTime = new Date(millisSinceEpoch);
        if (isNaN(authTime.getTime())) {
            throw new Error(`Internal assertion error: invalid user.lastLoginAt = ${user.lastLoginAt}`);
        }
        return authTime;
    }
    else if (user.lastRefreshAt != null) {
        const authTime = new Date(user.lastRefreshAt); // Parse from ISO date string.
        if (isNaN(authTime.getTime())) {
            throw new Error(`Internal assertion error: invalid user.lastRefreshAt = ${user.lastRefreshAt}`);
        }
        return authTime;
    }
    else {
        throw new Error(`Internal assertion error: Missing user.lastLoginAt and user.lastRefreshAt`);
    }
}
function verifyPhoneNumber(state, sessionInfo, code) {
    const verification = state.getVerificationCodeBySessionInfo(sessionInfo);
    (0, errors_1.assert)(verification, "INVALID_SESSION_INFO");
    (0, errors_1.assert)(verification.code === code, "INVALID_CODE");
    state.deleteVerificationCodeBySessionInfo(sessionInfo);
    return verification.phoneNumber;
}
const CUSTOM_ATTRIBUTES_MAX_LENGTH = 1000;
function validateSerializedCustomClaims(claims) {
    (0, errors_1.assert)(claims.length <= CUSTOM_ATTRIBUTES_MAX_LENGTH, "CLAIMS_TOO_LARGE");
    let parsed;
    try {
        parsed = JSON.parse(claims);
    }
    catch {
        throw new errors_1.BadRequestError("INVALID_CLAIMS");
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
function validateCustomClaims(claims) {
    // Only JSON objects (maps) are valid. Others are not.
    (0, errors_1.assert)(typeof claims === "object" && claims != null && !Array.isArray(claims), "INVALID_CLAIMS");
    for (const reservedField of FORBIDDEN_CUSTOM_CLAIMS) {
        (0, errors_1.assert)(!(reservedField in claims), `FORBIDDEN_CLAIM : ${reservedField}`);
    }
}
// generates a new random ID, checking against an optional set of "existing ids" for
// uniqueness. if a unique ID cannot be generated in 10 tries, an internal error is
// thrown. the ID generated by this method is not added to the set provided to this
// method, callers must manage their own state.
function newRandomId(length, existingIds) {
    for (let i = 0; i < 10; i++) {
        const id = (0, utils_1.randomId)(length);
        if (!existingIds?.has(id)) {
            return id;
        }
    }
    throw new errors_1.InternalError("INTERNAL_ERROR : Failed to generate a random ID after 10 attempts", "INTERNAL");
}
function getMfaEnrollmentsFromRequest(state, request, options) {
    const enrollments = [];
    const phoneNumbers = new Set();
    const enrollmentIds = new Set();
    for (const enrollment of request) {
        (0, errors_1.assert)(enrollment.phoneInfo && (0, utils_1.isValidPhoneNumber)(enrollment.phoneInfo), "INVALID_MFA_PHONE_NUMBER : Invalid format.");
        if (!phoneNumbers.has(enrollment.phoneInfo)) {
            const mfaEnrollmentId = options?.generateEnrollmentIds
                ? newRandomId(28, enrollmentIds)
                : enrollment.mfaEnrollmentId;
            (0, errors_1.assert)(mfaEnrollmentId, "INVALID_MFA_ENROLLMENT_ID : mfaEnrollmentId must be defined.");
            (0, errors_1.assert)(!enrollmentIds.has(mfaEnrollmentId), "DUPLICATE_MFA_ENROLLMENT_ID");
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
function getNormalizedUri(reqBody) {
    (0, errors_1.assert)(reqBody.requestUri, "MISSING_REQUEST_URI");
    const normalizedUri = (0, utils_1.parseAbsoluteUri)(reqBody.requestUri);
    (0, errors_1.assert)(normalizedUri, "INVALID_REQUEST_URI");
    if (reqBody.postBody) {
        const postBodyParams = new url_1.URLSearchParams(reqBody.postBody);
        for (const key of postBodyParams.keys()) {
            normalizedUri.searchParams.set(key, postBodyParams.get(key));
        }
    }
    const fragment = normalizedUri.hash.replace(/^#/, "");
    if (fragment) {
        const fragmentParams = new url_1.URLSearchParams(fragment);
        for (const key of fragmentParams.keys()) {
            normalizedUri.searchParams.set(key, fragmentParams.get(key));
        }
        normalizedUri.hash = "";
    }
    return normalizedUri;
}
function parseClaims(idTokenOrJsonClaims) {
    if (!idTokenOrJsonClaims) {
        return undefined;
    }
    let claims;
    if (idTokenOrJsonClaims.startsWith("{")) {
        try {
            claims = JSON.parse(idTokenOrJsonClaims);
        }
        catch {
            throw new errors_1.BadRequestError(`INVALID_IDP_RESPONSE : Unable to parse id_token: ${idTokenOrJsonClaims} ((Auth Emulator failed to parse fake id_token as strict JSON.))`);
        }
    }
    else {
        const decoded = (0, jsonwebtoken_1.decode)(idTokenOrJsonClaims, { json: true });
        if (!decoded) {
            return undefined;
        }
        claims = decoded;
    }
    (0, errors_1.assert)(claims.sub, 'INVALID_IDP_RESPONSE : Invalid Idp Response: id_token missing required fields. ((Missing "sub" field. This field is required and must be a unique identifier.))');
    (0, errors_1.assert)(typeof claims.sub === "string", 'INVALID_IDP_RESPONSE : ((The "sub" field must be a string.))');
    return claims;
}
function fakeFetchUserInfoFromIdp(providerId, claims, samlResponse) {
    const rawId = claims.sub;
    // Some common fields found in many IDPs.
    const email = claims.email ? (0, utils_1.canonicalizeEmailAddress)(claims.email) : undefined;
    const emailVerified = !!claims.email_verified;
    const displayName = claims.name;
    const photoUrl = claims.picture;
    const response = {
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
            response.email = nameId && (0, utils_1.isValidEmailAddress)(nameId) ? nameId : response.email;
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
function handleLinkIdp(state, response, userFromIdToken) {
    if (state.oneAccountPerEmail && response.email) {
        const userMatchingEmail = state.getUserByEmail(response.email);
        (0, errors_1.assert)(!userMatchingEmail || userMatchingEmail.localId === userFromIdToken.localId, "EMAIL_EXISTS");
    }
    response.localId = userFromIdToken.localId;
    const fields = {};
    if (state.oneAccountPerEmail && response.email && !userFromIdToken.email) {
        fields.email = response.email;
        fields.emailVerified = response.emailVerified;
    }
    if (response.email &&
        response.emailVerified &&
        (fields.email || userFromIdToken.email) === response.email) {
        fields.emailVerified = true;
    }
    return { accountUpdates: { fields }, response };
}
function handleIdpSigninEmailNotRequired(response, userMatchingProvider) {
    if (userMatchingProvider) {
        return {
            response: { ...response, localId: userMatchingProvider.localId },
            // No special updates needed.
            accountUpdates: {},
        };
    }
    else {
        return handleIdpSignUp(response, { emailRequired: false });
    }
}
function handleIdpSigninEmailRequired(response, rawId, userMatchingProvider, userMatchingEmail) {
    if (userMatchingProvider) {
        return {
            response: { ...response, localId: userMatchingProvider.localId },
            // No special updates needed.
            accountUpdates: {},
        };
    }
    else if (userMatchingEmail) {
        if (response.emailVerified) {
            if (userMatchingEmail.providerUserInfo?.some((info) => info.providerId === response.providerId && info.rawId !== rawId)) {
                // b/6793858: An account exists with the same email but different rawId,
                // i.e. when IDP has "recycled" an email address to a different account.
                response.emailRecycled = true;
            }
            response.localId = userMatchingEmail.localId;
            const accountUpdates = {
                fields: {},
            };
            if (!userMatchingEmail.emailVerified) {
                // If the top-level email is unverified, clear existing IDPs, phone, and
                // password. Otherwise, keep them (since email ownership is verified).
                accountUpdates.fields.passwordHash = undefined;
                accountUpdates.fields.phoneNumber = undefined;
                accountUpdates.fields.validSince = (0, utils_1.toUnixTimestamp)(new Date()).toString();
                accountUpdates.deleteProviders = userMatchingEmail.providerUserInfo?.map((info) => info.providerId);
            }
            // Set profile attributes to IDP-provided fields, discarding any old data.
            accountUpdates.fields.dateOfBirth = response.dateOfBirth;
            accountUpdates.fields.displayName = response.displayName;
            accountUpdates.fields.language = response.language;
            accountUpdates.fields.photoUrl = response.photoUrl;
            accountUpdates.fields.screenName = response.screenName;
            accountUpdates.fields.emailVerified = true; // Now verified by IDP.
            return { response, accountUpdates };
        }
        else {
            response.needConfirmation = true;
            response.localId = userMatchingEmail.localId;
            response.verifiedProvider = userMatchingEmail.providerUserInfo
                ?.map((info) => info.providerId)
                .filter((id) => id !== state_1.PROVIDER_PASSWORD && id !== state_1.PROVIDER_PHONE);
            return { response, accountUpdates: {} };
        }
    }
    else {
        return handleIdpSignUp(response, { emailRequired: true });
    }
}
function handleIdpSignUp(response, options) {
    const accountUpdates = {
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
function mfaPending(state, user, signInProvider) {
    if (!user.mfaInfo) {
        throw new Error("Internal assertion error: mfaPending called on user without MFA.");
    }
    const pendingCredentialPayload = {
        _AuthEmulatorMfaPendingCredential: "DO NOT MODIFY",
        localId: user.localId,
        signInProvider,
        projectId: state.projectId,
    };
    if (state instanceof state_1.TenantProjectState) {
        pendingCredentialPayload.tenantId = state.tenantId;
    }
    // Encode pendingCredentialPayload using base64. We don't encrypt or sign the
    // data in the Auth Emulator but just trust developers not to modify it.
    const mfaPendingCredential = Buffer.from(JSON.stringify(pendingCredentialPayload), "utf8").toString("base64");
    return { mfaPendingCredential, mfaInfo: user.mfaInfo.map(redactMfaInfo) };
}
function redactMfaInfo(mfaInfo) {
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
function obfuscatePhoneNumber(phoneNumber) {
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
function parsePendingCredential(state, pendingCredential) {
    let pendingCredentialPayload;
    try {
        const json = Buffer.from(pendingCredential, "base64").toString("utf8");
        pendingCredentialPayload = JSON.parse(json);
    }
    catch {
        (0, errors_1.assert)(false, "((Invalid phoneVerificationInfo.mfaPendingCredential.))");
    }
    (0, errors_1.assert)(pendingCredentialPayload._AuthEmulatorMfaPendingCredential, "((Invalid phoneVerificationInfo.mfaPendingCredential.))");
    (0, errors_1.assert)(pendingCredentialPayload.projectId === state.projectId, "INVALID_PROJECT_ID : Project ID does not match MFA pending credential.");
    if (state instanceof state_1.TenantProjectState) {
        (0, errors_1.assert)(pendingCredentialPayload.tenantId === state.tenantId, "INVALID_PROJECT_ID : Project ID does not match MFA pending credential.");
    }
    const { localId, signInProvider } = pendingCredentialPayload;
    const user = state.getUserByLocalId(localId);
    (0, errors_1.assert)(user, "((User in pendingCredentialPayload does not exist.))");
    return { user, signInProvider };
}
function createTenant(state, reqBody) {
    if (!(state instanceof state_1.AgentProjectState)) {
        throw new errors_1.InternalError("INTERNAL_ERROR : Can only create tenant in agent project", "INTERNAL");
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
        mfaConfig: mfaConfig,
        tenantId: "", // Placeholder until one is generated
    };
    return state.createTenant(tenant);
}
function listTenants(state, reqBody, ctx) {
    (0, errors_1.assert)(state instanceof state_1.AgentProjectState, "((Can only list tenants in agent project.))");
    const pageSize = Math.min(Math.floor(ctx.params.query.pageSize) || 20, 1000);
    const tenants = state.listTenants(ctx.params.query.pageToken);
    // As a non-standard behavior, passing in negative pageSize will
    // return all users starting from the pageToken.
    let nextPageToken = undefined;
    if (pageSize > 0 && tenants.length >= pageSize) {
        tenants.length = pageSize;
        nextPageToken = tenants[tenants.length - 1].tenantId;
    }
    return {
        nextPageToken,
        tenants,
    };
}
function deleteTenant(state) {
    (0, errors_1.assert)(state instanceof state_1.TenantProjectState, "((Can only delete tenant on tenant projects.))");
    state.delete();
    return {};
}
function getTenant(state) {
    (0, errors_1.assert)(state instanceof state_1.TenantProjectState, "((Can only get tenant on tenant projects.))");
    return state.tenantConfig;
}
function updateTenant(state, reqBody, ctx) {
    (0, errors_1.assert)(state instanceof state_1.TenantProjectState, "((Can only update tenant on tenant projects.))");
    return state.updateTenant(reqBody, ctx.params.query.updateMask);
}
function isMfaEnabled(state, user) {
    return ((state.mfaConfig.state === "ENABLED" || state.mfaConfig.state === "MANDATORY") &&
        user.mfaInfo?.length);
}
// TODO: Timeout is 60s. Should we make the timeout an emulator configuration?
async function fetchBlockingFunction(state, event, user, options = {}, oauthTokens = {}, timeoutMs = 60000) {
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
    const controller = new abort_controller_1.default();
    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);
    let response;
    let ok;
    let status;
    let text;
    try {
        const res = await (0, node_fetch_1.default)(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody),
            signal: controller.signal,
        });
        ok = res.ok;
        status = res.status;
        text = await res.text();
    }
    catch (thrown) {
        const err = thrown instanceof Error ? thrown : new Error(thrown);
        const isAbortError = err.name.includes("AbortError");
        if (isAbortError) {
            throw new errors_1.InternalError(`BLOCKING_FUNCTION_ERROR_RESPONSE : ((Deadline exceeded making request to ${url}.))`, err.message);
        }
        // All other server errors
        throw new errors_1.InternalError(`BLOCKING_FUNCTION_ERROR_RESPONSE : ((Failed to make request to ${url}.))`, err.message);
    }
    finally {
        clearTimeout(timeout);
    }
    (0, errors_1.assert)(ok, `BLOCKING_FUNCTION_ERROR_RESPONSE : ((HTTP request to ${url} returned HTTP error ${status}: ${text}))`);
    try {
        response = JSON.parse(text);
    }
    catch (thrown) {
        const err = thrown instanceof Error ? thrown : new Error(thrown);
        throw new errors_1.InternalError(`BLOCKING_FUNCTION_ERROR_RESPONSE : ((Response body is not valid JSON.))`, err.message);
    }
    return processBlockingFunctionResponse(event, response);
}
function processBlockingFunctionResponse(event, response) {
    // Only return updates that are specified in the update mask
    let extraClaims;
    const updates = {};
    if (response.userRecord) {
        const userRecord = response.userRecord;
        (0, errors_1.assert)(userRecord.updateMask, "BLOCKING_FUNCTION_ERROR_RESPONSE : ((Response UserRecord is missing updateMask.))");
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
                    const customClaims = JSON.stringify(userRecord.customClaims);
                    validateSerializedCustomClaims(customClaims);
                    updates.customAttributes = customClaims;
                    break;
                // Session claims are only returned in beforeSignIn and will be ignored
                // otherwise. For more info, see
                // https://cloud.google.com/identity-platform/docs/blocking-functions#modifying_a_user
                case "sessionClaims":
                    if (event !== state_1.BlockingFunctionEvents.BEFORE_SIGN_IN) {
                        break;
                    }
                    try {
                        extraClaims = userRecord.sessionClaims;
                    }
                    catch {
                        throw new errors_1.BadRequestError("BLOCKING_FUNCTION_ERROR_RESPONSE : ((Response has malformed session claims.))");
                    }
                    break;
                default:
                    break;
            }
        }
    }
    return { updates, extraClaims };
}
function generateBlockingFunctionJwt(state, event, url, timeoutMs, user, options, oauthTokens) {
    const issuedAt = (0, utils_1.toUnixTimestamp)(new Date());
    const jwt = {
        iss: `https://securetoken.google.com/${state.projectId}`,
        aud: url,
        iat: issuedAt,
        exp: issuedAt + timeoutMs / 100,
        event_id: (0, utils_1.randomBase64UrlStr)(16),
        event_type: event,
        user_agent: "NotYetSupportedInFirebaseAuthEmulator",
        ip_address: "127.0.0.1",
        locale: "en",
        user_record: {
            uid: user.localId,
            email: user.email,
            email_verified: user.emailVerified,
            display_name: user.displayName,
            photo_url: user.photoUrl,
            disabled: user.disabled,
            phone_number: user.phoneNumber,
            custom_claims: JSON.parse(user.customAttributes || "{}"),
        },
        sub: user.localId,
        sign_in_method: options.signInMethod,
        sign_in_second_factor: options.signInSecondFactor,
        sign_in_attributes: options.signInAttributes,
        raw_user_info: options.rawUserInfo,
    };
    if (state instanceof state_1.TenantProjectState) {
        jwt.tenant_id = state.tenantId;
        jwt.user_record.tenant_id = state.tenantId;
    }
    const providerData = [];
    if (user.providerUserInfo) {
        for (const providerUserInfo of user.providerUserInfo) {
            const provider = {
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
            const enrolledFactor = {
                uid: mfaEnrollment.mfaEnrollmentId,
                display_name: mfaEnrollment.displayName,
                enrollment_time: mfaEnrollment.enrolledAt,
                phone_number: mfaEnrollment.phoneInfo,
                factor_id: state_1.PROVIDER_PHONE,
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
    const jwtStr = (0, jsonwebtoken_1.sign)(jwt, "fake-secret", {
        algorithm: "none",
    });
    return jwtStr;
}
function parseBlockingFunctionJwt(jwt) {
    const decoded = (0, jsonwebtoken_1.decode)(jwt, { json: true });
    (0, errors_1.assert)(decoded, "((Invalid blocking function jwt.))");
    (0, errors_1.assert)(decoded.iss, "((Invalid blocking function jwt, missing `iss` claim.))");
    (0, errors_1.assert)(decoded.aud, "((Invalid blocking function jwt, missing `aud` claim.))");
    (0, errors_1.assert)(decoded.user_record, "((Invalid blocking function jwt, missing `user_record` claim.))");
    return decoded;
}
exports.parseBlockingFunctionJwt = parseBlockingFunctionJwt;
//# sourceMappingURL=operations.js.map