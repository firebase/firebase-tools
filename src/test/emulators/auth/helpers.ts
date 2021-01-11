import { STATUS_CODES } from "http";
import { inspect } from "util";
import * as supertest from "supertest";
import { expect, AssertionError } from "chai";
import { IdpJwtPayload } from "../../../emulator/auth/operations";
import { OobRecord, PhoneVerificationRecord, UserInfo } from "../../../emulator/auth/state";
import { TestAgent, PROJECT_ID } from "./setup";

export { PROJECT_ID };
export const TEST_PHONE_NUMBER = "+15555550100";
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
      }", with response body:\n${body}`
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
    input
  );
}

/* eslint-disable jsdoc/require-jsdoc */
// Most functions below are self-documenting test helpers.

export function registerUser(
  testAgent: TestAgent,
  user: { email: string; password: string; displayName?: string }
): Promise<{ idToken: string; localId: string; refreshToken: string; email: string }> {
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
    .send(user)
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(200, res);
      return {
        idToken: res.body.idToken,
        localId: res.body.localId,
        refreshToken: res.body.refreshToken,
        email: res.body.email,
      };
    });
}

export function registerAnonUser(
  testAgent: TestAgent
): Promise<{ idToken: string; localId: string; refreshToken: string }> {
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
    .send({ returnSecureToken: true })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(200, res);
      return {
        idToken: res.body.idToken,
        localId: res.body.localId,
        refreshToken: res.body.refreshToken,
      };
    });
}

export async function signInWithEmailLink(
  testAgent: TestAgent,
  email: string,
  idTokenToLink?: string
): Promise<{ idToken: string; localId: string; refreshToken: string; email: string }> {
  const { oobCode } = await createEmailSignInOob(testAgent, email);

  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
    .query({ key: "fake-api-key" })
    .send({ email, oobCode, idToken: idTokenToLink })
    .then((res) => {
      return {
        idToken: res.body.idToken,
        localId: res.body.localId,
        refreshToken: res.body.refreshToken,
        email,
      };
    });
}

export function signInWithPassword(
  testAgent: TestAgent,
  email: string,
  password: string
): Promise<{ idToken: string; localId: string; refreshToken: string; email: string }> {
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
    .send({ email, password })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(200, res);
      return {
        idToken: res.body.idToken,
        localId: res.body.localId,
        refreshToken: res.body.refreshToken,
        email: res.body.email,
      };
    });
}

export async function signInWithPhoneNumber(
  testAgent: TestAgent,
  phoneNumber: string
): Promise<{ idToken: string; localId: string; refreshToken: string }> {
  const sessionInfo = await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
    .query({ key: "fake-api-key" })
    .send({ phoneNumber, recaptchaToken: "ignored" })
    .then((res) => {
      expectStatusCode(200, res);
      return res.body.sessionInfo;
    });

  const codes = await inspectVerificationCodes(testAgent);

  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
    .query({ key: "fake-api-key" })
    .send({ sessionInfo, code: codes[0].code })
    .then((res) => {
      expectStatusCode(200, res);
      return {
        idToken: res.body.idToken,
        localId: res.body.localId,
        refreshToken: res.body.refreshToken,
      };
    });
}

export function signInWithFakeClaims(
  testAgent: TestAgent,
  providerId: string,
  claims: Partial<IdpJwtPayload> & { sub: string }
): Promise<{ idToken: string; localId: string; refreshToken: string; email?: string }> {
  const fakeIdToken = JSON.stringify(fakeClaims(claims));
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
    .query({ key: "fake-api-key" })
    .send({
      postBody: `providerId=${encodeURIComponent(providerId)}&id_token=${encodeURIComponent(
        fakeIdToken
      )}`,
      requestUri: "http://localhost",
      returnIdpCredential: true,
      returnSecureToken: true,
    })
    .then((res) => {
      expectStatusCode(200, res);
      return {
        idToken: res.body.idToken,
        localId: res.body.localId,
        refreshToken: res.body.refreshToken,
        email: res.body.email,
      };
    });
}

export async function expectUserNotExistsForIdToken(
  testAgent: TestAgent,
  idToken: string
): Promise<void> {
  await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(400, res);
      expect(res.body.error).to.have.property("message").equals("USER_NOT_FOUND");
    });
}

export async function expectIdTokenExpired(testAgent: TestAgent, idToken: string): Promise<void> {
  await testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(400, res);
      expect(res.body.error).to.have.property("message").equals("TOKEN_EXPIRED");
    });
}

export function getAccountInfoByIdToken(testAgent: TestAgent, idToken: string): Promise<UserInfo> {
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(200, res);
      expect(res.body.users || []).to.have.length(1);
      return res.body.users[0];
    });
}

export function getAccountInfoByLocalId(testAgent: TestAgent, localId: string): Promise<UserInfo> {
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ localId: [localId] })
    .set("Authorization", "Bearer owner")
    .then((res) => {
      expectStatusCode(200, res);
      expect(res.body.users || []).to.have.length(1);
      return res.body.users[0];
    });
}

export function inspectOobs(testAgent: TestAgent): Promise<OobRecord[]> {
  return testAgent.get(`/emulator/v1/projects/${PROJECT_ID}/oobCodes`).then((res) => {
    expectStatusCode(200, res);
    return res.body.oobCodes;
  });
}

export function inspectVerificationCodes(testAgent: TestAgent): Promise<PhoneVerificationRecord[]> {
  return testAgent.get(`/emulator/v1/projects/${PROJECT_ID}/verificationCodes`).then((res) => {
    expectStatusCode(200, res);
    return res.body.verificationCodes;
  });
}

export function createEmailSignInOob(
  testAgent: TestAgent,
  email: string
): Promise<{ oobCode: string; oobLink: string }> {
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
    .send({ email, requestType: "EMAIL_SIGNIN", returnOobLink: true })
    .set("Authorization", "Bearer owner")
    .then((res) => {
      expectStatusCode(200, res);
      return {
        oobCode: res.body.oobCode,
        oobLink: res.body.oobLink,
      };
    });
}

export function getSigninMethods(testAgent: TestAgent, email: string): Promise<string[]> {
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
    .send({ continueUri: "http://example.com/", identifier: email })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(200, res);
      return res.body.signinMethods;
    });
}

export function updateProjectConfig(testAgent: TestAgent, config: {}): Promise<void> {
  return testAgent
    .patch(`/emulator/v1/projects/${PROJECT_ID}/config`)
    .set("Authorization", "Bearer owner")
    .send(config)
    .then((res) => {
      expectStatusCode(200, res);
    });
}

export function updateAccountByLocalId(
  testAgent: TestAgent,
  localId: string,
  fields: {}
): Promise<void> {
  return testAgent
    .post("/identitytoolkit.googleapis.com/v1/accounts:update")
    .set("Authorization", "Bearer owner")
    .send({ localId, ...fields })
    .then((res) => {
      expectStatusCode(200, res);
    });
}
