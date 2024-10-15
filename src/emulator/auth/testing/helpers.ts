import { STATUS_CODES } from "http";
import { inspect } from "util";
import * as supertest from "supertest";
import { expect, AssertionError } from "chai";
import { IdpJwtPayload } from "../operations";
import { OobRecord, PhoneVerificationRecord, Tenant, UserInfo } from "../state";
import { TestAgent, PROJECT_ID } from "./setup";
import { MfaEnrollment, MfaEnrollments, Schemas } from "../types";

export { PROJECT_ID };
export const TEST_PHONE_NUMBER = "+15555550100";
export const TEST_PHONE_NUMBER_OBFUSCATED = "+*******0100";
export const TEST_PHONE_NUMBER_2 = "+15555550101";
export const TEST_PHONE_NUMBER_3 = "+15555550102";
export const TEST_MFA_INFO = {
  displayName: "Cell Phone",
  phoneInfo: TEST_PHONE_NUMBER,
};
export const TEST_INVALID_PHONE_NUMBER = "5555550100"; /* no country code */
export const DISPLAY_NAME = "Example User";
export const PHOTO_URL = "http://fakephotourl.test";
export const FAKE_GOOGLE_ACCOUNT = {
  displayName: "Example User",
  email: "example@gmail.com",
  emailVerified: true,
  rawId: "123456789012345678901",
  // An unsigned token, with payload format similar to a real one.
  idToken:
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpc3MiOiJhY2NvdW50cy5nb29nbGUuY29tIiwiYXpwIjoiMjI4NzQ2ODI4NDQtYjBzOHM3NWIzaWVkYjJtZDRobHMydm9xNnNsbGJzbTMuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiIyMjg3NDY4Mjg0NC1iMHM4czc1YjNpZWRiMm1kNGhsczJ2b3E2c2xsYnNtMy5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsInN1YiI6IjEyMzQ1Njc4OTAxMjM0NTY3ODkwMSIsImVtYWlsIjoiZXhhbXBsZUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiYXRfaGFzaCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJpYXQiOjE1OTc4ODI2ODEsImV4cCI6MTU5Nzg4NjI4MX0.",
  // Same as above, except with no email included.
  idTokenNoEmail:
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpc3MiOiJhY2NvdW50cy5nb29nbGUuY29tIiwiYXpwIjoiMjI4NzQ2ODI4NDQtYjBzOHM3NWIzaWVkYjJtZDRobHMydm9xNnNsbGJzbTMuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiIyMjg3NDY4Mjg0NC1iMHM4czc1YjNpZWRiMm1kNGhsczJ2b3E2c2xsYnNtMy5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsInN1YiI6IjEyMzQ1Njc4OTAxMjM0NTY3ODkwMSIsImF0X2hhc2giOiIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwiaWF0IjoxNTk3ODgyNjgxLCJleHAiOjE1OTc4ODYyODF9.",
};

// This is a real Google test account (go/rhea), owned and managed by a Googler.
// However, nobody needs to actually sign-in using this account -- no tests
// below requires actual Google sign-in, and the Auth Emulator doesn't validate.
// If for some reason the account or idToken below doesn't fit our testing need
// anymore, create a new test account and token. Don't ping anyone for password.
export const REAL_GOOGLE_ACCOUNT = {
  displayName: "Oberyn Baelish",
  email: "oberynbaelish.331826@gmail.com",
  emailVerified: true,
  rawId: "115113236566683398301",
  photoUrl:
    "https://lh3.googleusercontent.com/-KNaMyFnKZ9o/AAAAAAAAAAI/AAAAAAAAAAA/AMZuucnZC9bn4HcT-8bQka3uG3lUYd4lSA/photo.jpg",
  // ID Tokens below are also real, but their signatures has been zero'd out and
  // have expired long ago, so they are safe to use as examples in tests below.
  idToken:
    "eyJhbGciOiJSUzI1NiIsImtpZCI6IjZiYzYzZTlmMThkNTYxYjM0ZjU2NjhmODhhZTI3ZDQ4ODc2ZDgwNzMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJhY2NvdW50cy5nb29nbGUuY29tIiwiYXpwIjoiMjI4NzQ2ODI4NDQtYjBzOHM3NWIzaWVkYjJtZDRobHMydm9xNnNsbGJzbTMuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiIyMjg3NDY4Mjg0NC1iMHM4czc1YjNpZWRiMm1kNGhsczJ2b3E2c2xsYnNtMy5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsInN1YiI6IjExNTExMzIzNjU2NjY4MzM5ODMwMSIsImVtYWlsIjoib2JlcnluYmFlbGlzaC4zMzE4MjZAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImF0X2hhc2giOiJXNTlTOEs4Y3g0Y3hYYmh0YmFXYndBIiwiaWF0IjoxNTk3ODgyNjgxLCJleHAiOjE1OTc4ODYyODF9.000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  idTokenNoEmail:
    "eyJhbGciOiJSUzI1NiIsImtpZCI6IjZiYzYzZTlmMThkNTYxYjM0ZjU2NjhmODhhZTI3ZDQ4ODc2ZDgwNzMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJhY2NvdW50cy5nb29nbGUuY29tIiwiYXpwIjoiMjI4NzQ2ODI4NDQtYjBzOHM3NWIzaWVkYjJtZDRobHMydm9xNnNsbGJzbTMuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiIyMjg3NDY4Mjg0NC1iMHM4czc1YjNpZWRiMm1kNGhsczJ2b3E2c2xsYnNtMy5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsInN1YiI6IjExNTExMzIzNjU2NjY4MzM5ODMwMSIsImF0X2hhc2giOiJJRHA0UFFldFItLUFyaWhXX2NYMmd3IiwiaWF0IjoxNTk3ODgyNDQyLCJleHAiOjE1OTc4ODYwNDJ9.000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
};

// Used for testing blocking functions
export const BLOCKING_FUNCTION_HOST = "http://my-blocking-function.test";
export const BEFORE_CREATE_PATH = "/beforeCreate";
export const BEFORE_SIGN_IN_PATH = "/beforeSignIn";
export const BEFORE_CREATE_URL = BLOCKING_FUNCTION_HOST + BEFORE_CREATE_PATH;
export const BEFORE_SIGN_IN_URL = BLOCKING_FUNCTION_HOST + BEFORE_SIGN_IN_PATH;

/**
 * Asserts that the response has the expected status code.
 * @param expected the expected status code
 * @param res the supertest Response
 */
export function expectStatusCode(expected: number, res: supertest.Response): void {
  if (res.status !== expected) {
    const body = inspect(res.body);
    throw new AssertionError(
      `expected ${expected} "${STATUS_CODES[expected]}", got ${res.status} "${
        STATUS_CODES[res.status]
      }", with response body:\n${body}`,
    );
  }
}

/**
 * Create a fake claims object with some default field values plus custom ones.
 * @param input custom field values
 * @return a complete claims plain JS object
 */
export function fakeClaims(input: Partial<IdpJwtPayload> & { sub: string }): IdpJwtPayload {
  return Object.assign(
    {
      iss: "example.com",
      aud: "example.com",
      exp: 1597974008,
      iat: 1597970408,
    },
    input,
  );
}

/* eslint-disable jsdoc/require-jsdoc */
// Most functions below are self-documenting test helpers.

export async function registerUser(
  testAgent: TestAgent,
  user: {
    email: string;
    password: string;
    displayName?: string;
    mfaInfo?: MfaEnrollments;
    tenantId?: string;
  },
): Promise<{ idToken: string; localId: string; refreshToken: string; email: string }> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
    .send(user)
    .query({ key: "fake-api-key" });
  expectStatusCode(200, res);
  return {
    idToken: res.body.idToken,
    localId: res.body.localId,
    refreshToken: res.body.refreshToken,
    email: res.body.email,
  };
}

export async function registerAnonUser(
  testAgent: TestAgent,
): Promise<{ idToken: string; localId: string; refreshToken: string }> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
    .send({ returnSecureToken: true })
    .query({ key: "fake-api-key" });
  expectStatusCode(200, res);
  return {
    idToken: res.body.idToken,
    localId: res.body.localId,
    refreshToken: res.body.refreshToken,
  };
}

export async function signInWithEmailLink(
  testAgent: TestAgent,
  email: string,
  idTokenToLink?: string,
): Promise<{ idToken: string; localId: string; refreshToken: string; email: string }> {
  const { oobCode } = await createEmailSignInOob(testAgent, email);

  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
    .query({ key: "fake-api-key" })
    .send({ email, oobCode, idToken: idTokenToLink });
  return {
    idToken: res.body.idToken,
    localId: res.body.localId,
    refreshToken: res.body.refreshToken,
    email,
  };
}

export async function signInWithPassword(
  testAgent: TestAgent,
  email: string,
  password: string,
  extractMfaPending: boolean = false,
): Promise<{
  idToken?: string;
  localId?: string;
  refreshToken?: string;
  email?: string;
  mfaPendingCredential?: string;
  mfaEnrollmentId?: string;
}> {
  if (extractMfaPending) {
    const res = await testAgent
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .send({ email, password })
      .query({ key: "fake-api-key" });

    expectStatusCode(200, res);
    const mfaPendingCredential = res.body.mfaPendingCredential as string;
    const mfaInfo = res.body.mfaInfo as MfaEnrollment[];
    return { mfaPendingCredential, mfaEnrollmentId: mfaInfo[0].mfaEnrollmentId };
  }
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
    .send({ email, password })
    .query({ key: "fake-api-key" });
  expectStatusCode(200, res);
  return {
    idToken: res.body.idToken,
    localId: res.body.localId,
    refreshToken: res.body.refreshToken,
    email: res.body.email,
  };
}

export async function signInWithPhoneNumber(
  testAgent: TestAgent,
  phoneNumber: string,
): Promise<{ idToken: string; localId: string; refreshToken: string }> {
  const verificationRes = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
    .query({ key: "fake-api-key" })
    .send({ phoneNumber, recaptchaToken: "ignored" });
  expectStatusCode(200, verificationRes);
  const sessionInfo = verificationRes.body.sessionInfo;

  const codes = await inspectVerificationCodes(testAgent);

  const signInRes = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
    .query({ key: "fake-api-key" })
    .send({ sessionInfo, code: codes[0].code });
  expectStatusCode(200, signInRes);
  return {
    idToken: signInRes.body.idToken,
    localId: signInRes.body.localId,
    refreshToken: signInRes.body.refreshToken,
  };
}

export async function signInWithFakeClaims(
  testAgent: TestAgent,
  providerId: string,
  claims: Partial<IdpJwtPayload> & { sub: string },
  tenantId?: string,
): Promise<{ idToken: string; localId: string; refreshToken: string; email?: string }> {
  const fakeIdToken = JSON.stringify(fakeClaims(claims));
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
    .query({ key: "fake-api-key" })
    .send({
      postBody: `providerId=${encodeURIComponent(providerId)}&id_token=${encodeURIComponent(
        fakeIdToken,
      )}`,
      requestUri: "http://localhost",
      returnIdpCredential: true,
      returnSecureToken: true,
      tenantId,
    });
  expectStatusCode(200, res);
  return {
    idToken: res.body.idToken,
    localId: res.body.localId,
    refreshToken: res.body.refreshToken,
    email: res.body.email,
  };
}

export async function expectUserNotExistsForIdToken(
  testAgent: TestAgent,
  idToken: string,
  tenantId?: string,
): Promise<void> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken, tenantId })
    .query({ key: "fake-api-key" });
  expectStatusCode(400, res);
  expect(res.body.error).to.have.property("message").equals("USER_NOT_FOUND");
}

export async function expectIdTokenExpired(testAgent: TestAgent, idToken: string): Promise<void> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken })
    .query({ key: "fake-api-key" });
  expectStatusCode(400, res);
  expect(res.body.error).to.have.property("message").equals("TOKEN_EXPIRED");
}

export async function getAccountInfoByIdToken(
  testAgent: TestAgent,
  idToken: string,
  tenantId?: string,
): Promise<UserInfo> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken, tenantId })
    .query({ key: "fake-api-key" });
  expectStatusCode(200, res);
  expect(res.body.users || []).to.have.length(1);
  return res.body.users[0];
}

export async function getAccountInfoByLocalId(
  testAgent: TestAgent,
  localId: string,
  tenantId?: string,
): Promise<UserInfo> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ localId: [localId], tenantId })
    .set("Authorization", "Bearer owner");
  expectStatusCode(200, res);
  expect(res.body.users || []).to.have.length(1);
  return res.body.users[0];
}

export async function inspectOobs(testAgent: TestAgent, tenantId?: string): Promise<OobRecord[]> {
  const path = tenantId
    ? `/emulator/v1/projects/${PROJECT_ID}/tenants/${tenantId}/oobCodes`
    : `/emulator/v1/projects/${PROJECT_ID}/oobCodes`;
  const res = await testAgent.get(path);
  expectStatusCode(200, res);
  return res.body.oobCodes;
}

export async function inspectVerificationCodes(
  testAgent: TestAgent,
  tenantId?: string,
): Promise<PhoneVerificationRecord[]> {
  const path = tenantId
    ? `/emulator/v1/projects/${PROJECT_ID}/tenants/${tenantId}/verificationCodes`
    : `/emulator/v1/projects/${PROJECT_ID}/verificationCodes`;
  const res = await testAgent.get(path);
  expectStatusCode(200, res);
  return res.body.verificationCodes;
}

export async function createEmailSignInOob(
  testAgent: TestAgent,
  email: string,
  tenantId?: string,
): Promise<{ oobCode: string; oobLink: string }> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
    .send({ email, requestType: "EMAIL_SIGNIN", returnOobLink: true, tenantId })
    .set("Authorization", "Bearer owner");
  expectStatusCode(200, res);
  return {
    oobCode: res.body.oobCode,
    oobLink: res.body.oobLink,
  };
}

export async function getSigninMethods(testAgent: TestAgent, email: string): Promise<string[]> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
    .send({ continueUri: "http://example.com/", identifier: email })
    .query({ key: "fake-api-key" });
  expectStatusCode(200, res);
  return res.body.signinMethods;
}

export async function updateProjectConfig(testAgent: TestAgent, config: {}): Promise<void> {
  const res = await testAgent
    .patch(`/emulator/v1/projects/${PROJECT_ID}/config`)
    .set("Authorization", "Bearer owner")
    .send(config);
  expectStatusCode(200, res);
}

export async function updateAccountByLocalId(
  testAgent: TestAgent,
  localId: string,
  fields: {},
): Promise<void> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:update")
    .set("Authorization", "Bearer owner")
    .send({ localId, ...fields });
  expectStatusCode(200, res);
}

export async function enrollPhoneMfa(
  testAgent: TestAgent,
  idToken: string,
  phoneNumber: string,
  tenantId?: string,
): Promise<{ idToken: string; refreshToken: string }> {
  const mfaStartRes = await testAgent
    .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
    .query({ key: "fake-api-key" })
    .send({ idToken, phoneEnrollmentInfo: { phoneNumber }, tenantId });
  expectStatusCode(200, mfaStartRes);
  expect(mfaStartRes.body.phoneSessionInfo.sessionInfo).to.be.a("string");
  const sessionInfo = mfaStartRes.body.phoneSessionInfo.sessionInfo as string;

  const code = (await inspectVerificationCodes(testAgent, tenantId))[0].code;

  const mfaFinalRes = await testAgent
    .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
    .query({ key: "fake-api-key" })
    .send({ idToken, phoneVerificationInfo: { code, sessionInfo }, tenantId });
  expectStatusCode(200, mfaFinalRes);
  expect(mfaFinalRes.body.idToken).to.be.a("string");
  expect(mfaFinalRes.body.refreshToken).to.be.a("string");
  return { idToken: mfaFinalRes.body.idToken, refreshToken: mfaFinalRes.body.refreshToken };
}

export async function deleteAccount(testAgent: TestAgent, reqBody: {}): Promise<string> {
  const res = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
    .send(reqBody)
    .query({ key: "fake-api-key" });
  expectStatusCode(200, res);
  expect(res.body).not.to.have.property("error");
  return res.body.kind;
}

export async function registerTenant(
  testAgent: TestAgent,
  projectId: string,
  tenant?: Schemas["GoogleCloudIdentitytoolkitAdminV2Tenant"],
): Promise<Tenant> {
  const res = await testAgent
    .post(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants`)
    .query({ key: "fake-api-key" })
    .set("Authorization", "Bearer owner")
    .send(tenant);
  expectStatusCode(200, res);
  return res.body;
}

export async function updateConfig(
  testAgent: TestAgent,
  projectId: string,
  config: Schemas["GoogleCloudIdentitytoolkitAdminV2Config"],
  updateMask?: string,
): Promise<void> {
  const res = await testAgent
    .patch(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/config`)
    .set("Authorization", "Bearer owner")
    .query({ updateMask })
    .send(config);
  expectStatusCode(200, res);
}
