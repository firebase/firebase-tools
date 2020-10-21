import { STATUS_CODES } from "http";
import { inspect } from "util";
import * as supertest from "supertest";
import { expect, AssertionError } from "chai";
import { decode as decodeJwt, sign as signJwt, JwtHeader } from "jsonwebtoken";
import { createApp } from "../../emulator/auth/server";
import {
  FirebaseJwtPayload,
  IdpJwtPayload,
  CUSTOM_TOKEN_AUDIENCE,
} from "../../emulator/auth/operations";
import {
  ProjectState,
  OobRecord,
  PhoneVerificationRecord,
  UserInfo,
  ProviderUserInfo,
  PROVIDER_PASSWORD,
  PROVIDER_PHONE,
  SIGNIN_METHOD_EMAIL_LINK,
  PROVIDER_CUSTOM,
} from "../../emulator/auth/state";
import { useFakeTimers } from "sinon";

/* eslint-disable camelcase, @typescript-eslint/camelcase, @typescript-eslint/no-non-null-assertion */
const PROJECT_ID = "example";

const TEST_PHONE_NUMBER = "+15555550100";

const FAKE_GOOGLE_ACCOUNT = {
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
const REAL_GOOGLE_ACCOUNT = {
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

describe("Auth emulator", () => {
  let authApp: Express.Application;
  const projectStateForId = new Map<string, ProjectState>();
  before(async function() {
    // eslint-disable-next-line no-invalid-this
    this.timeout(10000);
    authApp = await createApp(PROJECT_ID, projectStateForId);
  });

  beforeEach(() => projectStateForId.clear());

  let clock: sinon.SinonFakeTimers;
  beforeEach(() => {
    clock = useFakeTimers();
  });
  afterEach(() => clock.restore());

  it("should respond to status checks", async () => {
    await supertest(authApp)
      .get("/")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.authEmulator).to.be.an("object");
      });
  });

  describe("authentication", () => {
    it("should throw 403 if API key is not provided", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .query({
          /* no API "key" */
        })
        .send({ returnSecureToken: true })
        .then((res) => {
          expectStatusCode(403, res);
          expect(res.body.error)
            .to.have.property("status")
            .equal("PERMISSION_DENIED");
        });
    });
    it("should ignore non-Bearer Authorization headers", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        // This has no effect on the request handling, since it is not Bearer.
        .set("Authorization", "Basic YWxhZGRpbjpvcGVuc2VzYW1l")
        .query({
          /* no API "key" */
        })
        .send({ returnSecureToken: true })
        .then((res) => {
          expectStatusCode(403, res);
          expect(res.body.error)
            .to.have.property("status")
            .equal("PERMISSION_DENIED");
        });
    });

    it("should treat Bearer owner as authenticated to project", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        // This authenticates as valid OAuth 2 credentials, no API key needed.
        .set("Authorization", "Bearer owner")
        .send({
          // This field requires OAuth 2 and should work correctly.
          targetProjectId: "example2",
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("error");
        });
    });

    it("should ignore casing of Bearer / owner in Authorization header", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        // This authenticates as valid OAuth 2 credentials, no API key needed.
        .set("Authorization", "bEArEr OWNER")
        .send({
          // This field requires OAuth 2 and should work correctly.
          targetProjectId: "example2",
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("error");
        });
    });

    it("should treat production service account as authenticated to project", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        // This authenticates as owner of the default projectId. The exact value
        // and expiry don't matter -- the Emulator only checks for the format.
        .set("Authorization", "Bearer ya29.AHES6ZRVmB7fkLtd1XTmq6mo0S1wqZZi3-Lh_s-6Uw7p8vtgSwg")
        .send({
          // This field requires OAuth 2 and should work correctly.
          targetProjectId: "example2",
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("error");
        });
    });

    it("should deny requests with targetProjectId but without OAuth 2", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .query({ key: "fake-api-key" })
        .send({
          // Specifying this field requires OAuth 2. API key is not sufficient.
          targetProjectId: "example2",
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals(
              "INSUFFICIENT_PERMISSION : Only authenticated requests can specify target_project_id."
            );
        });
    });
  });

  describe("accounts:signUp", () => {
    it("should throw error if no email provided", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ password: "notasecret" /* no email */ })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_EMAIL");
        });
    });

    it("should issue idToken and refreshToken on anon signUp", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ returnSecureToken: true })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.be.a("string");
          expect(decoded!.payload.provider_id).equals("anonymous");
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("anonymous");
        });
    });

    it("should issue refreshToken on email+password signUp", async () => {
      const email = "me@example.com";
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email, password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.be.a("string");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("password");
          expect(decoded!.payload.firebase.identities).to.eql({
            email: [email],
          });
        });
    });

    it("should ignore displayName and photoUrl for new anon account", async () => {
      const user = {
        displayName: "Me",
        photoUrl: "http://localhost/my-profile.png",
      };
      const idToken = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send(user)
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.displayName).to.be.undefined;
          expect(res.body.photoUrl).to.be.undefined;
          return res.body.idToken;
        });
      const info = await getAccountInfoByIdToken(authApp, idToken);
      expect(info.displayName).to.be.undefined;
      expect(info.photoUrl).to.be.undefined;
    });

    it("should set displayName but ignore photoUrl for new password account", async () => {
      const user = {
        email: "me@example.com",
        password: "notasecret",
        displayName: "Me",
        photoUrl: "http://localhost/my-profile.png",
      };
      const idToken = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send(user)
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.displayName).to.equal(user.displayName);
          expect(res.body.photoUrl).to.be.undefined;
          return res.body.idToken;
        });
      const info = await getAccountInfoByIdToken(authApp, idToken);
      expect(info.displayName).to.equal(user.displayName);
      expect(info.photoUrl).to.be.undefined;
    });

    it("should disallow duplicate email signUp", async () => {
      const user = { email: "bob@example.com", password: "notasecret" };
      await registerUser(authApp, user);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email: user.email, password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("EMAIL_EXISTS");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        // Case variants of a same email address are also considered duplicates.
        .send({ email: "BOB@example.com", password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("EMAIL_EXISTS");
        });
    });

    it("should error if another account exists with same email from IDP", async () => {
      const email = "alice@example.com";
      await signInWithFakeClaims(authApp, "google.com", { sub: "123", email });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email, password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("EMAIL_EXISTS");
        });
    });

    it("should error when email format is invalid", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email: "not.an.email.address.at.all", password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("INVALID_EMAIL");
        });
    });

    it("should normalize email address to all lowercase", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email: "AlIcE@exAMPle.COM", password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.email).equals("alice@example.com");
        });
    });

    it("should error when password is too short", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email: "me@example.com", password: "short" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .that.satisfy((str: string) => str.startsWith("WEAK_PASSWORD"));
        });
    });

    it("should error when idToken is provided but email / password is not", async () => {
      const { idToken } = await registerAnonUser(authApp);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ idToken /* no email / password */ })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_EMAIL");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ idToken, email: "alice@example.com" /* no password */ })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_PASSWORD");
        });
    });

    it("should link email and password to anon user if idToken is provided", async () => {
      const { idToken, localId } = await registerAnonUser(authApp);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ idToken, email: "alice@example.com", password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("password");
        });
    });

    it("should link email and password to phone sign-in user", async () => {
      const phoneNumber = TEST_PHONE_NUMBER;
      const email = "alice@example.com";

      const { idToken, localId } = await signInWithPhoneNumber(authApp, phoneNumber);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ idToken, email, password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("password");

          // The result account should have both phone and email.
          expect(decoded!.payload.firebase.identities).to.eql({
            phone: [phoneNumber],
            email: [email],
          });
        });
    });

    it("should error if account to be linked is disabled", async () => {
      const { idToken, localId } = await registerAnonUser(authApp);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ idToken, email: "alice@example.com", password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });

    it("should replace existing email / password in linked account", async () => {
      const oldEmail = "alice@example.com";
      const newEmail = "bob@example.com";
      const oldPassword = "notasecret";
      const newPassword = "notasecret2";

      const { idToken, localId } = await registerUser(authApp, {
        email: oldEmail,
        password: oldPassword,
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ idToken, email: newEmail, password: newPassword })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
          expect(res.body.email).to.equal(newEmail);
          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.payload.email).to.equal(newEmail);
          expect(decoded!.payload.firebase.identities).to.eql({
            email: [newEmail],
          });
        });

      const oldEmailSignInMethods = await getSigninMethods(authApp, oldEmail);
      expect(oldEmailSignInMethods).to.be.empty;
    });

    it("should create new account with phone number when authenticated", async () => {
      const phoneNumber = TEST_PHONE_NUMBER;
      const displayName = "Alice";
      const localId = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .set("Authorization", "Bearer owner")
        .send({ phoneNumber, displayName })
        .then((res) => {
          expectStatusCode(200, res);

          // Shouldn't be set for authenticated requests:
          expect(res.body).not.to.have.property("idToken");
          expect(res.body).not.to.have.property("refreshToken");

          expect(res.body.displayName).to.equal(displayName);
          expect(res.body.localId).to.be.a("string").and.not.empty;
          return res.body.localId as string;
        });

      // This should sign into the same user.
      const phoneAuth = await signInWithPhoneNumber(authApp, phoneNumber);
      expect(phoneAuth.localId).to.equal(localId);

      const info = await getAccountInfoByIdToken(authApp, phoneAuth.idToken);
      expect(info.displayName).to.equal(displayName); // should already be set.
    });

    it("should error when extra localId parameter is provided", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .query({ key: "fake-api-key" })
        .send({ localId: "anything" /* cannot be specified since this is unauthenticated */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("UNEXPECTED_PARAMETER : User ID");
        });

      const { idToken, localId } = await registerAnonUser(authApp);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .set("Authorization", "Bearer owner")
        .send({
          idToken,
          localId, // Cannot be specified since idToken already identifies the user.
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("UNEXPECTED_PARAMETER : User ID");
        });
    });

    it("should create new account with specified localId when authenticated", async () => {
      const localId = "haha";
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .set("Authorization", "Bearer owner")
        .send({ localId })
        .then((res) => {
          expectStatusCode(200, res);

          // Shouldn't be set for authenticated requests:
          expect(res.body).not.to.have.property("idToken");
          expect(res.body).not.to.have.property("refreshToken");

          expect(res.body.localId).to.equal(localId);
        });
    });

    it("should error when creating new user with duplicate localId", async () => {
      const { localId } = await registerAnonUser(authApp);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .set("Authorization", "Bearer owner")
        .send({ localId })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("DUPLICATE_LOCAL_ID");
        });
    });

    it("should error if phone number is invalid", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .set("Authorization", "Bearer owner")
        .send({ phoneNumber: "5555550100" /* no country code */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("INVALID_PHONE_NUMBER : Invalid format.");
        });
    });
  });

  describe("accounts:createAuthUri", () => {
    it("should report not registered user as not registered", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ continueUri: "http://example.com/", identifier: "notregistered@example.com" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("registered")
            .equals(false);
          expect(res.body)
            .to.have.property("sessionId")
            .that.is.a("string");
        });
    });

    it("should return providers for a registered user", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      await registerUser(authApp, user);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ continueUri: "http://example.com/", identifier: user.email })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("registered")
            .equals(true);
          expect(res.body)
            .to.have.property("allProviders")
            .eql(["password"]);
          expect(res.body)
            .to.have.property("signinMethods")
            .eql(["password"]);
          expect(res.body)
            .to.have.property("sessionId")
            .that.is.a("string");
        });
    });

    it("should return existing sessionId if provided", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({
          continueUri: "http://example.com/",
          identifier: "notregistered@example.com",
          sessionId: "my-session-1",
        })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("registered")
            .equals(false);
          expect(res.body)
            .to.have.property("sessionId")
            .equals("my-session-1");
        });
    });

    it("should find user by email ignoring case", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      await registerUser(authApp, user);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ continueUri: "http://example.com/", identifier: "AlIcE@exAMPle.COM" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.registered).equals(true);
        });
    });

    it("should find user by either IDP email or 'top-level' email", async () => {
      const email = "bob@example.com";
      const emailAtProvider = "alice@example.com";
      const providerId = "google.com";

      const { idToken } = await signInWithFakeClaims(authApp, providerId, {
        sub: "12345",
        email: emailAtProvider,
      });
      await signInWithEmailLink(authApp, email, idToken);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ continueUri: "http://example.com/", identifier: email })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.registered).to.equal(true);
          expect(res.body.allProviders).to.have.members([PROVIDER_PASSWORD, providerId]);
          expect(res.body.signinMethods).to.have.members([SIGNIN_METHOD_EMAIL_LINK, providerId]);
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ continueUri: "http://example.com/", identifier: emailAtProvider })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.registered).to.equal(true);
          expect(res.body.allProviders).to.have.members([PROVIDER_PASSWORD, providerId]);
          expect(res.body.signinMethods).to.have.members([SIGNIN_METHOD_EMAIL_LINK, providerId]);
        });
    });

    it("should not list IDP sign-in methods when allowDuplicateEmails", async () => {
      const email = "bob@example.com";
      const emailAtProvider = "alice@example.com";
      const providerId = "google.com";

      const { idToken } = await signInWithFakeClaims(authApp, providerId, {
        sub: "12345",
        email: emailAtProvider,
      });
      await signInWithEmailLink(authApp, email, idToken);

      await updateProjectConfig(authApp, { signIn: { allowDuplicateEmails: true } });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ continueUri: "http://example.com/", identifier: email })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.registered).to.equal(true);
          expect(res.body.allProviders).to.have.members([PROVIDER_PASSWORD]);
          expect(res.body.signinMethods).to.have.members([SIGNIN_METHOD_EMAIL_LINK]);
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ continueUri: "http://example.com/", identifier: emailAtProvider })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.registered).to.equal(true);
          expect(res.body.allProviders).to.have.members([PROVIDER_PASSWORD]);
          expect(res.body.signinMethods).to.have.members([SIGNIN_METHOD_EMAIL_LINK]);
        });
    });

    it("should error if identifier or continueUri is not provided", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({
          /* no identifier */
          continueUri: "http://example.com/",
        })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_IDENTIFIER");
        });
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({
          identifier: "me@example.com",
          /* no continueUri */
        })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_CONTINUE_URI");
        });
    });

    it("should error if identifier is invalid", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ identifier: "invalid", continueUri: "http://localhost/" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("INVALID_IDENTIFIER");
        });
    });

    it("should error if continueUri is invalid", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
        .send({ identifier: "me@example.com", continueUri: "invalid" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("INVALID_CONTINUE_URI");
        });
    });
  });

  describe("accounts:delete", () => {
    it("should delete the user of the idToken", async () => {
      const { idToken } = await registerUser(authApp, {
        email: "alice@example.com",
        password: "notasecret",
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
        .send({ idToken })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("error");
        });

      await expectUserNotExistsForIdToken(authApp, idToken);
    });

    it("should error when trying to delete by localId without OAuth", async () => {
      const { localId } = await registerUser(authApp, {
        email: "alice@example.com",
        password: "notasecret",
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
        .send({ localId })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_ID_TOKEN");
        });
    });

    it("should remove federated accounts for user", async () => {
      const email = "alice@example.com";
      const providerId = "google.com";
      const sub = "12345";
      const { localId, idToken } = await signInWithFakeClaims(authApp, providerId, {
        sub,
        email,
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
        .query({ key: "fake-api-key" })
        .send({ idToken })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("error");
        });

      expect(await getSigninMethods(authApp, email)).to.be.empty;

      const signInAgain = await signInWithFakeClaims(authApp, providerId, {
        sub,
        email,
      });
      expect(signInAgain.localId).not.to.equal(localId);
    });

    it("should delete the user by localId if OAuth credentials are present", async () => {
      const { localId, idToken } = await registerUser(authApp, {
        email: "alice@example.com",
        password: "notasecret",
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
        .set("Authorization", "Bearer owner")
        .send({ localId })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("error");
        });

      await expectUserNotExistsForIdToken(authApp, idToken);
    });

    it("should error if missing localId when OAuth credentials are present", async () => {
      const { idToken } = await registerUser(authApp, {
        email: "alice@example.com",
        password: "notasecret",
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
        .set("Authorization", "Bearer owner")
        .send({ idToken /* no localId */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_LOCAL_ID");
        });
    });
  });

  describe("accounts:signInWithPassword", () => {
    it("should issue tokens when email and password are valid", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { localId } = await registerUser(authApp, user);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: user.email, password: user.password })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).equals(localId);
          expect(res.body.email).equals(user.email);
          expect(res.body)
            .to.have.property("registered")
            .equals(true);
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.equal(localId);
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("password");
        });
    });

    it("should validate email address ignoring case", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { localId } = await registerUser(authApp, user);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: "AlIcE@exAMPle.COM", password: user.password })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).equals(localId);
        });
    });

    it("should error if email or password is missing", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ /* no email */ password: "notasecret" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).equals("MISSING_EMAIL");
        });
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: "nosuchuser@example.com" /* no password */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).equals("MISSING_PASSWORD");
        });
    });

    it("should error if email is not found", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: "nosuchuser@example.com", password: "notasecret" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).equals("EMAIL_NOT_FOUND");
        });
    });

    it("should error if password is wrong", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      await registerUser(authApp, user);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        // Passwords are case sensitive. The uppercase one below doesn't match.
        .send({ email: user.email, password: "NOTASECRET" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).equals("INVALID_PASSWORD");
        });
    });

    it("should error if user is disabled", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { localId } = await registerUser(authApp, user);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: user.email, password: "notasecret" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });
  });

  describe("accounts:update", () => {
    it("should allow updating and deleting displayName and photoUrl", async () => {
      const { idToken } = await registerAnonUser(authApp);

      const attrs = { displayName: "Alice", photoUrl: "http://localhost/alice.png" };
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken, ...attrs })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.displayName).equals(attrs.displayName);
          expect(res.body.photoUrl).equals(attrs.photoUrl);

          // Updating name and picture shouldn't issue a new token.
          expect(res.body).not.to.have.property("idToken");
          expect(res.body).not.to.have.property("refreshToken");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken, deleteAttribute: ["DISPLAY_NAME", "PHOTO_URL"] })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("displayName");
          expect(res.body).not.to.have.property("photoUrl");
        });
    });

    it("should set password and issue new tokens", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { localId, idToken } = await registerUser(authApp, user);
      const newPassword = "notasecreteither";

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken, password: newPassword })
        .then((res) => {
          expectStatusCode(200, res);
          // Updating password causes new tokens to be issued.
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");
          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.equal(localId);
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("password");
        });

      // New password now works.
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: user.email, password: newPassword })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).equals(localId);
        });
    });

    it("should add password provider to anon user", async () => {
      const { localId, idToken } = await registerAnonUser(authApp);
      const email = "alice@example.com";
      const password = "notasecreteither";

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken, email, password })
        .then((res) => {
          expectStatusCode(200, res);
          // Adding password causes new tokens to be issued.
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");
          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.equal(localId);
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("password");
        });

      // New password now works.
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email, password })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).equals(localId);
        });

      expect(await getSigninMethods(authApp, email)).to.eql(["password"]);
    });

    it("should allow adding email without password to anon user", async () => {
      const { localId, idToken } = await registerAnonUser(authApp);
      const email = "alice@example.com";

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken, email })
        .then((res) => {
          expectStatusCode(200, res);
          // Setting email causes new tokens to be issued.
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");
          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.equal(localId);
          // This remains the same as provider used by the previous idToken.
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("anonymous");
        });

      expect(await getSigninMethods(authApp, email)).not.to.contain(["password"]);
    });

    it("should allow changing email of an existing user", async () => {
      const oldEmail = "alice@example.com";
      const password = "notasecret";
      const newEmail = "bob@example.com";
      const { localId, idToken } = await registerUser(authApp, { email: oldEmail, password });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken, email: newEmail })
        .then((res) => {
          expectStatusCode(200, res);
          // Changing email causes new tokens to be issued.
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");
          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.equal(localId);
          expect(decoded!.payload.email).to.equal(newEmail);
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("password");
        });

      // New email now works.
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: newEmail, password })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).equals(localId);
        });

      // Old email can no longer be used to sign in.
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: oldEmail, password })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).equals("EMAIL_NOT_FOUND");
        });
    });

    it("should disallow setting email to same as an existing user", async () => {
      const user = { email: "bob@example.com", password: "notasecret" };
      await registerUser(authApp, user);
      const { idToken } = await registerAnonUser(authApp);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .send({ idToken, email: user.email })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("EMAIL_EXISTS");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        // Case variants of a same email address are also considered duplicates.
        .send({ idToken, email: "BOB@example.com", password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("EMAIL_EXISTS");
        });
    });

    it("should noop when setting phoneNumber to the same as before", async () => {
      const phoneNumber = TEST_PHONE_NUMBER;
      const { localId, idToken } = await signInWithPhoneNumber(authApp, phoneNumber);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, phoneNumber })
        .then((res) => expectStatusCode(200, res));

      const info = await getAccountInfoByIdToken(authApp, idToken);
      expect(info.phoneNumber).to.equal(phoneNumber);
    });

    it("should disallow setting phone to same as an existing user", async () => {
      const phoneNumber = TEST_PHONE_NUMBER;
      await signInWithPhoneNumber(authApp, phoneNumber);
      const { localId } = await registerAnonUser(authApp);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, phoneNumber })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("PHONE_NUMBER_EXISTS");
        });
    });

    it("should error if phoneNumber is invalid", async () => {
      const { localId } = await registerAnonUser(authApp);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, phoneNumber: "555-555-0100" /* no country code */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("INVALID_PHONE_NUMBER : Invalid format.");
        });
    });

    it("should error if user is disabled when updating by idToken", async () => {
      const { localId, idToken } = await registerAnonUser(authApp);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken, displayName: "Foo" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("USER_DISABLED");
        });
    });

    it("should still update user dispite user is disabled when authenticated", async () => {
      const { localId } = await registerAnonUser(authApp);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      // These should still work.
      await updateAccountByLocalId(authApp, localId, { displayName: "Foo" });
      await updateAccountByLocalId(authApp, localId, { disableUser: false });
    });

    it("should invalidate old tokens after updating validSince or password", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { idToken } = await registerUser(authApp, user);

      // Move time forward so idToken's iat (issuedAt) is in the past.
      clock.tick(2000);

      const idToken2 = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken, password: "notasecreteither" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.idToken as string;
        });

      // Old idToken should no longer work, while the new one works.
      await expectIdTokenExpired(authApp, idToken);
      await getAccountInfoByIdToken(authApp, idToken2);

      // Move time forward so idToken2's iat (issuedAt) is in the past.
      clock.tick(2000);

      const idToken3 = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({
          idToken: idToken2,
          validSince: "0" /* any value works, only the presence of the field matters */,
        })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.idToken as string;
        });

      await expectIdTokenExpired(authApp, idToken);
      await expectIdTokenExpired(authApp, idToken2);
      await getAccountInfoByIdToken(authApp, idToken3);
    }).timeout(5000);

    function itShouldDeleteProvider(
      createUser: () => Promise<{ idToken: string; email?: string }>,
      providerId: string
    ): void {
      it(`should delete ${providerId} provider from user`, async () => {
        const user = await createUser();
        await supertest(authApp)
          .post("/identitytoolkit.googleapis.com/v1/accounts:update")
          .query({ key: "fake-api-key" })
          .send({ idToken: user.idToken, deleteProvider: [providerId] })
          .then((res) => {
            expectStatusCode(200, res);
            const providers = (res.body.providerUserInfo || []).map(
              (info: ProviderUserInfo) => info.providerId
            );
            expect(providers).not.to.include(providerId);
          });

        if (user.email) {
          expect(await getSigninMethods(authApp, user.email)).not.to.contain(providerId);
          expect(await getSigninMethods(authApp, user.email)).not.to.contain("emailLink");
        }
      });
    }

    itShouldDeleteProvider(
      () => registerUser(authApp, { email: "alice@example.com", password: "notasecret" }),
      PROVIDER_PASSWORD
    );
    itShouldDeleteProvider(() => signInWithPhoneNumber(authApp, TEST_PHONE_NUMBER), PROVIDER_PHONE);
    itShouldDeleteProvider(
      () =>
        signInWithFakeClaims(authApp, "google.com", {
          sub: "12345",
          email: "bob@example.com",
        }),
      "google.com"
    );

    it("should update user by localId when authenticated", async () => {
      const { localId } = await registerUser(authApp, {
        email: "foo@example.com",
        password: "barbaz",
      });

      const attrs = {
        phoneNumber: TEST_PHONE_NUMBER,
        displayName: "Alice",
        photoUrl: "http://localhost/alice.png",
      };
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, ...attrs, emailVerified: true })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.displayName).to.equal(attrs.displayName);
          expect(res.body.photoUrl).to.equal(attrs.photoUrl);
          expect(res.body.emailVerified).to.be.true;
        });
    });

    it("should error if authenticated request does not specify localId", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ emailVerified: true /* no localId */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("MISSING_LOCAL_ID");
        });
    });

    it("should update customAttributes and add them to ID Tokens", async () => {
      const { localId, email } = await registerUser(authApp, {
        email: "foo@example.com",
        password: "barbaz",
      });

      const attrs = {
        foo: "bar",
        baz: { answer: 42 },
      };
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, customAttributes: JSON.stringify(attrs) })
        .then((res) => expectStatusCode(200, res));

      const { idToken } = await signInWithEmailLink(authApp, email);
      const decoded = decodeJwt(idToken, { complete: true }) as {
        header: JwtHeader;
        payload: FirebaseJwtPayload;
      } | null;
      expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
      expect(decoded!.payload)
        .to.have.property("foo")
        .to.eql(attrs.foo);
      expect(decoded!.payload)
        .to.have.property("baz")
        .to.eql(attrs.baz);
    });

    it("should error if customAttributes are invalid", async () => {
      const { localId } = await registerUser(authApp, {
        email: "foo@example.com",
        password: "barbaz",
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, customAttributes: "{definitely[not]json}" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("INVALID_CLAIMS");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, customAttributes: "42" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("INVALID_CLAIMS");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, customAttributes: '["a", "b"]' })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("INVALID_CLAIMS");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        // Contains a forbidden field "sub".
        .send({ localId, customAttributes: '{"sub": "12345"}' })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("FORBIDDEN_CLAIM : sub");
        });

      const longString = new Array(999).join("x");
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .set("Authorization", "Bearer owner")
        .send({ localId, customAttributes: `{"a":"${longString}"}` })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("CLAIMS_TOO_LARGE");
        });
    });
  });

  describe("accounts:sendOobCode", () => {
    it("should generate OOB code for verify email", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { idToken, localId } = await registerUser(authApp, user);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        .send({ idToken, requestType: "VERIFY_EMAIL" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.email).to.equal(user.email);

          // These fields should not be set since returnOobLink is not set.
          expect(res.body).not.to.have.property("oobCode");
          expect(res.body).not.to.have.property("oobLink");
        });

      const oobs = await inspectOobs(authApp);
      expect(oobs).to.have.length(1);
      expect(oobs[0].email).to.equal(user.email);
      expect(oobs[0].requestType).to.equal("VERIFY_EMAIL");

      // The returned oobCode can be redeemed to verify the email.
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        // OOB code is enough, no idToken needed.
        .send({ oobCode: oobs[0].oobCode })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
          expect(res.body.email).to.equal(user.email);
          expect(res.body.emailVerified).to.equal(true);
        });

      // oobCode is removed after redeemed.
      const oobs2 = await inspectOobs(authApp);
      expect(oobs2).to.have.length(0);
    });

    it("should return OOB code directly for requests with OAuth 2", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      await registerUser(authApp, user);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .set("Authorization", "Bearer owner")
        .send({ email: user.email, requestType: "PASSWORD_RESET", returnOobLink: true })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.email).to.equal(user.email);
          expect(res.body.oobCode).to.be.a("string");
          expect(res.body.oobLink).to.be.a("string");
        });
    });

    it("should error when trying to verify email without idToken", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      await registerUser(authApp, user);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        // Just email, no idToken. (It works for password reset but not verify.)
        .send({ email: user.email, requestType: "VERIFY_EMAIL" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equal("INVALID_ID_TOKEN");
        });

      const oobs = await inspectOobs(authApp);
      expect(oobs).to.have.length(0);
    });

    it("should error when verifying email for accounts without email", async () => {
      const { idToken } = await registerAnonUser(authApp);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        .send({ idToken, requestType: "VERIFY_EMAIL" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equal("MISSING_EMAIL");
        });

      const oobs = await inspectOobs(authApp);
      expect(oobs).to.have.length(0);
    });

    it("should error if user is disabled", async () => {
      const { localId, idToken, email } = await registerUser(authApp, {
        email: "foo@example.com",
        password: "foobar",
      });
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        .send({ email, idToken, requestType: "VERIFY_EMAIL" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("USER_DISABLED");
        });
    });

    it("should error when continueUrl is invalid", async () => {
      const { idToken } = await registerUser(authApp, {
        email: "alice@example.com",
        password: "notasecret",
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        .send({
          idToken,
          requestType: "VERIFY_EMAIL",
          continueUrl: "noSchemeOrHost", // <-- invalid
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .contain("INVALID_CONTINUE_URI");
        });

      const oobs = await inspectOobs(authApp);
      expect(oobs).to.have.length(0);
    });

    it("should generate OOB code for reset password", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { idToken } = await registerUser(authApp, user);

      clock.tick(2000); // Wait for idToken to be issued in the past.

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        .send({ requestType: "PASSWORD_RESET", email: user.email })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.email).to.equal(user.email);

          // These fields should not be set since returnOobLink is not set.
          expect(res.body).not.to.have.property("oobCode");
          expect(res.body).not.to.have.property("oobLink");
        });

      const oobs = await inspectOobs(authApp);
      expect(oobs).to.have.length(1);
      expect(oobs[0].email).to.equal(user.email);
      expect(oobs[0].requestType).to.equal("PASSWORD_RESET");

      // The returned oobCode can be redeemed to reset the password.
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:resetPassword")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, newPassword: "notasecret2" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.requestType).to.equal("PASSWORD_RESET");
          expect(res.body.email).to.equal(user.email);
        });

      // All old idTokens are invalidated.
      await expectIdTokenExpired(authApp, idToken);
    });

    it("should return purpose of oobCodes via resetPassword endpoint", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { idToken } = await registerUser(authApp, user);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        .send({ requestType: "PASSWORD_RESET", email: user.email })
        .then((res) => expectStatusCode(200, res));

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        .send({ requestType: "VERIFY_EMAIL", idToken })
        .then((res) => expectStatusCode(200, res));

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .query({ key: "fake-api-key" })
        .send({ email: "bob@example.com", requestType: "EMAIL_SIGNIN" })
        .then((res) => expectStatusCode(200, res));

      const oobs = await inspectOobs(authApp);
      expect(oobs).to.have.length(3);

      for (const oob of oobs) {
        await supertest(authApp)
          .post("/identitytoolkit.googleapis.com/v1/accounts:resetPassword")
          .query({ key: "fake-api-key" })
          // If newPassword is not set, this API will just return the purpose
          // (requestType) of the code without consuming it.
          .send({ oobCode: oob.oobCode })
          .then((res) => {
            expectStatusCode(200, res);
            expect(res.body.requestType).to.equal(oob.requestType);
            if (oob.requestType === "EMAIL_SIGNIN") {
              // Do not reveal the email when inspecting an email sign-in oobCode.
              // Instead, the client must provide email (e.g. by asking the user)
              // when they call the emailLinkSignIn endpoint.
              // See: https://firebase.google.com/docs/auth/web/email-link-auth#security_concerns
              expect(res.body).not.to.have.property("email");
            } else {
              expect(res.body.email).to.equal(oob.email);
            }
          });
      }

      // OOB codes are not consumed by the lookup above.
      const oobs2 = await inspectOobs(authApp);
      expect(oobs2).to.have.length(3);
    });
  });

  describe("email link sign-in", () => {
    it("should send OOB code to new emails and create account on sign-in", async () => {
      const email = "alice@example.com";
      await createEmailSignInOob(authApp, email);

      const oobs = await inspectOobs(authApp);
      expect(oobs).to.have.length(1);
      expect(oobs[0].email).to.equal(email);
      expect(oobs[0].requestType).to.equal("EMAIL_SIGNIN");

      // The returned oobCode can be redeemed to sign-in.
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, email })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("idToken")
            .that.is.a("string");
          expect(res.body.email).to.equal(email);
          expect(res.body.isNewUser).to.equal(true);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.be.a("string");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("password"); // The provider name is (confusingly) "password".
        });

      expect(await getSigninMethods(authApp, email)).to.have.members(["emailLink"]);
    });

    it("should sign an existing account in and enable email-link sign-in for them", async () => {
      const user = { email: "bob@example.com", password: "notasecret" };
      const { localId, idToken } = await registerUser(authApp, user);
      const { oobCode } = await createEmailSignInOob(authApp, user.email);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email: user.email, oobCode })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
        .query({ key: "fake-api-key" })
        .send({ idToken })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.users).to.have.length(1);
          expect(res.body.users[0])
            .to.have.property("emailLinkSignin")
            .equal(true);
        });

      expect(await getSigninMethods(authApp, user.email)).to.have.members([
        "password",
        "emailLink",
      ]);
    });

    it("should error on invalid oobCode", async () => {
      const email = "alice@example.com";
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email, oobCode: "invalid" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("INVALID_OOB_CODE");
        });
    });

    it("should error if user is disabled", async () => {
      const { localId, email } = await registerUser(authApp, {
        email: "bob@example.com",
        password: "notasecret",
      });
      const { oobCode } = await createEmailSignInOob(authApp, email);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email, oobCode })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });

    it("should error if email mismatches", async () => {
      const { oobCode } = await createEmailSignInOob(authApp, "alice@example.com");

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email: "NOT-alice@example.com", oobCode })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal(
            "INVALID_EMAIL : The email provided does not match the sign-in email address."
          );
        });
    });

    it("should link existing account with idToken to new email", async () => {
      const oldEmail = "bob@example.com";
      const newEmail = "alice@example.com";
      const { localId, idToken } = await registerUser(authApp, {
        email: oldEmail,
        password: "notasecret",
      });
      const { oobCode } = await createEmailSignInOob(authApp, newEmail);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email: newEmail, oobCode, idToken })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
          expect(res.body.email).to.equal(newEmail);
        });

      expect(await getSigninMethods(authApp, newEmail)).to.have.members(["password", "emailLink"]);
      expect(await getSigninMethods(authApp, oldEmail)).to.be.empty;
    });

    it("should link existing phone-auth account to new email", async () => {
      const { localId, idToken } = await signInWithPhoneNumber(authApp, TEST_PHONE_NUMBER);
      const email = "alice@example.com";
      const { oobCode } = await createEmailSignInOob(authApp, email);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email, oobCode, idToken })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
          expect(res.body.email).to.equal(email);
        });

      // Sign-in methods should not contain "phone", since phone sign-in is not
      // associated with an email address.
      expect(await getSigninMethods(authApp, email)).to.have.members(["emailLink"]);
    });

    it("should error when trying to link an email already used in another account", async () => {
      const { idToken } = await signInWithPhoneNumber(authApp, TEST_PHONE_NUMBER);
      const email = "alice@example.com";
      await registerUser(authApp, { email, password: "notasecret" });
      const { oobCode } = await createEmailSignInOob(authApp, email);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email, oobCode, idToken })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("EMAIL_EXISTS");
        });
    });

    it("should error if user to be linked is disabled", async () => {
      const { email, localId, idToken } = await registerUser(authApp, {
        email: "alice@example.com",
        password: "notasecret",
      });
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      const { oobCode } = await createEmailSignInOob(authApp, email);

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email, oobCode, idToken })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("USER_DISABLED");
        });
    });
  });

  describe("phone auth sign-in", () => {
    it("should return fake recaptcha params", async () => {
      await supertest(authApp)
        .get("/identitytoolkit.googleapis.com/v1/recaptchaParams")
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("recaptchaStoken")
            .that.is.a("string");
          expect(res.body)
            .to.have.property("recaptchaSiteKey")
            .that.is.a("string");
        });
    });

    it("should pretend to send a verification code via SMS", async () => {
      const phoneNumber = TEST_PHONE_NUMBER;

      const sessionInfo = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("sessionInfo")
            .that.is.a("string");
          return res.body.sessionInfo;
        });

      const codes = await inspectVerificationCodes(authApp);
      expect(codes).to.have.length(1);
      expect(codes[0].phoneNumber).to.equal(phoneNumber);
      expect(codes[0].sessionInfo).to.equal(sessionInfo);
      expect(codes[0].code).to.be.a("string");
    });

    it("should error when phone number is missing when calling sendVerificationCode", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ recaptchaToken: "ignored" /* no phone number */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            // This matches the production behavior. For some reason, it's not MISSING_PHONE_NUMBER.
            .equals("INVALID_PHONE_NUMBER : Invalid format.");
        });
    });

    it("should error when phone number is invalid", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ recaptchaToken: "ignored", phoneNumber: "invalid" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("INVALID_PHONE_NUMBER : Invalid format.");
        });
    });

    it("should create new account by verifying phone number", async () => {
      const phoneNumber = TEST_PHONE_NUMBER;

      const sessionInfo = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });

      const codes = await inspectVerificationCodes(authApp);
      const code = codes[0].code;

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("isNewUser")
            .equals(true);
          expect(res.body)
            .to.have.property("phoneNumber")
            .equals(phoneNumber);

          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.user_id).to.be.a("string");
          expect(decoded!.payload.phone_number).to.equal(phoneNumber);
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("phone");
          expect(decoded!.payload.firebase.identities).to.eql({ phone: [phoneNumber] });
        });
    });

    it("should error when sessionInfo or code is missing for signInWithPhoneNumber", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ code: "123456" /* no sessionInfo */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_SESSION_INFO");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo: "something-something" /* no code */ })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("MISSING_CODE");
        });
    });

    it("should error when sessionInfo or code is invalid", async () => {
      const phoneNumber = TEST_PHONE_NUMBER;

      const sessionInfo = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });

      const codes = await inspectVerificationCodes(authApp);
      const code = codes[0].code;

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo: "totally-invalid", code })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("INVALID_SESSION_INFO");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        // Try to send the code but with an extra "1" appended.
        // This is definitely invalid since we won't have another pending code.
        .send({ sessionInfo, code: code + "1" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("INVALID_CODE");
        });
    });

    it("should error if user is disabled", async () => {
      const phoneNumber = TEST_PHONE_NUMBER;
      const { localId } = await signInWithPhoneNumber(authApp, phoneNumber);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      const sessionInfo = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });

      const codes = await inspectVerificationCodes(authApp);
      const code = codes[0].code;

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("USER_DISABLED");
        });
    });

    it("should link phone number to existing account by idToken", async () => {
      const { localId, idToken } = await registerAnonUser(authApp);

      const phoneNumber = TEST_PHONE_NUMBER;
      const sessionInfo = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });

      const codes = await inspectVerificationCodes(authApp);
      const code = codes[0].code;

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code, idToken })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("isNewUser")
            .equals(false);
          expect(res.body)
            .to.have.property("phoneNumber")
            .equals(phoneNumber);
          expect(res.body.localId).to.equal(localId);
        });
    });

    it("should error if user to be linked is disabled", async () => {
      const { localId, idToken } = await registerAnonUser(authApp);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      const phoneNumber = TEST_PHONE_NUMBER;
      const sessionInfo = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });

      const codes = await inspectVerificationCodes(authApp);
      const code = codes[0].code;

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code, idToken })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("USER_DISABLED");
        });
    });

    it("should return temporaryProof if phone number already belongs to another account", async () => {
      // Given a phone number that is already registered...
      const phoneNumber = TEST_PHONE_NUMBER;
      await signInWithPhoneNumber(authApp, phoneNumber);

      const { idToken } = await registerAnonUser(authApp);

      const sessionInfo = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });

      const codes = await inspectVerificationCodes(authApp);
      const code = codes[0].code;

      const temporaryProof = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code, idToken })
        .then((res) => {
          expectStatusCode(200, res);
          // The linking will fail, but a successful response is still returned
          // with a temporaryProof (so that clients may call this API again
          // without having to verify the phone number again).
          expect(res.body).not.to.have.property("idToken");
          expect(res.body)
            .to.have.property("phoneNumber")
            .equals(phoneNumber);
          expect(res.body.temporaryProof).to.be.a("string");
          return res.body.temporaryProof;
        });

      // When called again with the returned temporaryProof, the real error
      // message should now be returned.
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ idToken, phoneNumber, temporaryProof })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("PHONE_NUMBER_EXISTS");
        });
    });
  });

  describe("token refresh", () => {
    it("should exchange refresh token for new tokens", async () => {
      const { refreshToken, localId } = await registerAnonUser(authApp);
      await supertest(authApp)
        .post("/securetoken.googleapis.com/v1/token")
        .type("form")
        // snake_case parameters also work, per OAuth 2.0 spec.
        .send({ refresh_token: refreshToken, grantType: "refresh_token" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.id_token).to.be.a("string");
          expect(res.body.access_token).to.equal(res.body.id_token);
          expect(res.body.refresh_token).to.be.a("string");
          expect(res.body.expires_in)
            .to.be.a("string")
            .matches(/[0-9]+/);
          expect(res.body.project_id).to.equal("12345");
          expect(res.body.token_type).to.equal("Bearer");
          expect(res.body.user_id).to.equal(localId);
        });
    });

    it("should error if user is disabled", async () => {
      const { refreshToken, localId } = await registerAnonUser(authApp);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      await supertest(authApp)
        .post("/securetoken.googleapis.com/v1/token")
        .type("form")
        .send({ refreshToken: refreshToken, grantType: "refresh_token" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });
  });

  describe("sign-in with credentials", () => {
    it("should create new account with IDP from unsigned ID token", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `providerId=google.com&id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
          returnSecureToken: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.isNewUser).to.equal(true);
          expect(res.body.email).to.equal(FAKE_GOOGLE_ACCOUNT.email);
          expect(res.body.emailVerified).to.equal(FAKE_GOOGLE_ACCOUNT.emailVerified);
          expect(res.body.federatedId).to.equal(
            `https://accounts.google.com/${FAKE_GOOGLE_ACCOUNT.rawId}`
          );
          expect(res.body.oauthIdToken).to.equal(FAKE_GOOGLE_ACCOUNT.idToken);
          expect(res.body.providerId).to.equal("google.com");
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          // The ID Token used above does NOT contain name or photo, so the
          // account created won't have those attributes either.
          expect(res.body).not.to.have.property("displayName");
          expect(res.body).not.to.have.property("photoUrl");

          const raw = JSON.parse(res.body.rawUserInfo);
          expect(raw.id).to.equal(FAKE_GOOGLE_ACCOUNT.rawId);
          expect(raw.email).to.equal(FAKE_GOOGLE_ACCOUNT.email);
          expect(raw.verified_email).to.equal(true);
          expect(raw.locale).to.equal("en");
          // name, given_name, family_name, and picture are not populated since
          // they are not in the ID Token used above.
          expect(raw.granted_scopes.split(" ")).to.have.members([
            "openid",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/userinfo.email",
          ]);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [FAKE_GOOGLE_ACCOUNT.rawId],
              email: [FAKE_GOOGLE_ACCOUNT.email],
            });
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("google.com");
        });
    });

    it("should create new account with IDP from production ID token", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `providerId=google.com&id_token=${REAL_GOOGLE_ACCOUNT.idToken}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
          returnSecureToken: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.isNewUser).to.equal(true);
          expect(res.body.email).to.equal(REAL_GOOGLE_ACCOUNT.email);
          expect(res.body.emailVerified).to.equal(REAL_GOOGLE_ACCOUNT.emailVerified);
          expect(res.body.federatedId).to.equal(
            `https://accounts.google.com/${REAL_GOOGLE_ACCOUNT.rawId}`
          );
          expect(res.body.oauthIdToken).to.equal(REAL_GOOGLE_ACCOUNT.idToken);
          expect(res.body.providerId).to.equal("google.com");
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          // The ID Token used above does NOT contain name or photo, so the
          // account created won't have those attributes either.
          // TODO: Shall we fetch more profile info from IDP via API calls?
          expect(res.body).not.to.have.property("displayName");
          expect(res.body).not.to.have.property("photoUrl");

          const raw = JSON.parse(res.body.rawUserInfo);
          expect(raw.id).to.equal(REAL_GOOGLE_ACCOUNT.rawId);
          expect(raw.email).to.equal(REAL_GOOGLE_ACCOUNT.email);
          expect(raw.verified_email).to.equal(true);
          expect(raw.locale).to.equal("en");
          // name, given_name, family_name, and picture are not populated since
          // they are not in the ID Token used above.
          expect(raw.granted_scopes.split(" ")).to.have.members([
            "openid",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/userinfo.email",
          ]);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [REAL_GOOGLE_ACCOUNT.rawId],
              email: [REAL_GOOGLE_ACCOUNT.email],
            });
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("google.com");
        });
    });

    it("should create new account with IDP from unencoded JSON claims", async () => {
      const claims = fakeClaims({
        sub: "123456789012345678901",
        name: "Ada Lovelace",
        given_name: "Ada",
        family_name: "Lovelace",
        picture: "http://localhost/fake-picture-url.png",
      });
      const fakeIdToken = JSON.stringify(claims);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
          returnSecureToken: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.isNewUser).to.equal(true);
          expect(res.body.federatedId).to.equal(`https://accounts.google.com/${claims.sub}`);
          expect(res.body.oauthIdToken).to.equal(fakeIdToken);
          expect(res.body.providerId).to.equal("google.com");
          expect(res.body.displayName).to.equal(claims.name);
          expect(res.body.fullName).to.equal(claims.name);
          expect(res.body.firstName).to.equal(claims.given_name);
          expect(res.body.lastName).to.equal(claims.family_name);
          expect(res.body.photoUrl).to.equal(claims.picture);
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const raw = JSON.parse(res.body.rawUserInfo);
          expect(raw.id).to.equal(claims.sub);
          expect(raw.name).to.equal(claims.name);
          expect(raw.given_name).to.equal(claims.given_name);
          expect(raw.family_name).to.equal(claims.family_name);
          expect(raw.picture).to.equal(claims.picture);
          expect(raw.granted_scopes.split(" ")).not.to.contain(
            "https://www.googleapis.com/auth/userinfo.email"
          );

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [claims.sub],
            });
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("google.com");
        });
    });

    it("should accept params (e.g. providerId, id_token) in requestUri", async () => {
      const claims = fakeClaims({
        sub: "123456789012345678901",
      });
      const fakeIdToken = JSON.stringify(claims);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          // No postBody, all params in requestUri below.
          requestUri: `http://localhost?providerId=google.com&id_token=${encodeURIComponent(
            fakeIdToken
          )}`,
          returnIdpCredential: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.providerId).to.equal("google.com");
        });
    });

    it("should copy attributes to user on IDP sign-up", async () => {
      const claims = fakeClaims({
        sub: "123456789012345678901",
        screen_name: "turingcomplete",
        name: "Alan Turing",
        picture: "http://localhost/turing.png",
      });
      const { idToken } = await signInWithFakeClaims(authApp, "google.com", claims);

      const user = await getAccountInfoByIdToken(authApp, idToken);
      expect(user.photoUrl).equal(claims.picture);
      expect(user.displayName).equal(claims.name);
      expect(user.screenName).equal(claims.screen_name);
    });

    it("should allow duplicate emails if set in project config", async () => {
      await updateProjectConfig(authApp, { signIn: { allowDuplicateEmails: true } });

      const email = "alice@example.com";

      // Given there exists an account with email already:
      const user1 = await registerUser(authApp, { email, password: "notasecret" });

      // When trying to sign-in with IDP that claims the same email:
      const user2 = await signInWithFakeClaims(authApp, "google.com", {
        sub: "123456789012345678901",
        email,
      });

      // It should create a new account with different local ID:
      expect(user2.localId).not.to.equal(user1.localId);
    });

    it("should sign-up new users without copying email when allowing duplicate emails", async () => {
      await updateProjectConfig(authApp, { signIn: { allowDuplicateEmails: true } });

      const email = "alice@example.com";

      const user1 = await signInWithFakeClaims(authApp, "google.com", {
        sub: "123456789012345678901",
        email,
      });

      const info = await getAccountInfoByIdToken(authApp, user1.idToken);
      expect(info.email).to.be.undefined;
    });

    it("should allow multiple providers with same email when allowing duplicate emails", async () => {
      await updateProjectConfig(authApp, { signIn: { allowDuplicateEmails: true } });

      const email = "alice@example.com";

      const user1 = await signInWithFakeClaims(authApp, "google.com", {
        sub: "123456789012345678901",
        email,
      });
      const user2 = await signInWithFakeClaims(authApp, "facebook.com", {
        sub: "123456789012345678901",
        email,
      });

      expect(user2.localId).not.to.equal(user1.localId);
    });

    it("should sign in existing account if (providerId, sub) is the same", async () => {
      const user1 = await signInWithFakeClaims(authApp, "google.com", {
        sub: "123456789012345678901",
      });

      // Same sub, same user.
      const user2 = await signInWithFakeClaims(authApp, "google.com", {
        sub: "123456789012345678901",
      });
      expect(user2.localId).to.equal(user1.localId);

      // Different sub, different user.
      const user3 = await signInWithFakeClaims(authApp, "google.com", {
        sub: "000000000000000000000",
      });
      expect(user3.localId).not.to.equal(user1.localId);

      // Different providerId, different user.
      const user4 = await signInWithFakeClaims(authApp, "apple.com", {
        sub: "123456789012345678901",
      });
      expect(user4.localId).not.to.equal(user1.localId);
    });

    it("should error if user is disabled", async () => {
      const user = await signInWithFakeClaims(authApp, "google.com", {
        sub: "123456789012345678901",
      });
      await updateAccountByLocalId(authApp, user.localId, { disableUser: true });

      const claims = fakeClaims({
        sub: "123456789012345678901",
        name: "Foo",
      });
      const fakeIdToken = JSON.stringify(claims);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken: user.idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });

    it("should add IDP as a sign-in method for email if available", async () => {
      const email = "foo@example.com";
      const sub = "123456789012345678901";
      await signInWithFakeClaims(authApp, "google.com", {
        sub,
        email,
      });
      expect(await getSigninMethods(authApp, email)).to.eql(["google.com"]);

      const newEmail = "bar@example.com";
      const { idToken } = await signInWithFakeClaims(authApp, "google.com", {
        sub,
        email: newEmail,
      });

      expect(await getSigninMethods(authApp, newEmail)).to.eql(["google.com"]);

      // The account-level email is still the old email.
      const info = await getAccountInfoByIdToken(authApp, idToken);
      expect(info.email).to.equal(email);
    });

    it("should unlink password and overwite profile attributes if user had unverified email", async () => {
      // Given a user with unverified email, linked with password:
      const { localId, email } = await registerUser(authApp, {
        email: "foo@example.com",
        password: "notasecret",
        displayName: "Foo",
      });

      // When signing in with IDP and IDP verifies email:
      const providerId = "google.com";
      const photoUrl = "http://localhost/photo-from-idp.png";
      const idpSignIn = await signInWithFakeClaims(authApp, providerId, {
        sub: "123456789012345678901",
        email,
        email_verified: true,
        picture: photoUrl,
      });

      // It should sign-in into the same account, but the account's password
      // should be unlinked.
      expect(idpSignIn.localId).to.equal(localId);
      const signInMethods = await getSigninMethods(authApp, email);
      expect(signInMethods).to.eql([providerId]);
      expect(signInMethods).not.to.contain([PROVIDER_PASSWORD]);

      const info = await getAccountInfoByIdToken(authApp, idpSignIn.idToken);
      expect(info.emailVerified).to.be.true; // Verified by IDP.

      // Profile attributes should be overwritten (if provided by IDP) or cleared.
      expect(info.photoUrl).to.equal(photoUrl);
      expect(info.displayName).to.be.undefined; // Not provided by IDP.
    });

    it("should not unlink password if email was already verified", async () => {
      // Given a user with verified email, linked with password:
      const user = {
        email: "foo@example.com",
        password: "notasecret",
        displayName: "Foo",
      };
      const { localId, email } = await registerUser(authApp, user);
      await signInWithEmailLink(authApp, email); // Verify email via email link sign-in.

      // When signing in with IDP and IDP verifies email:
      const providerId = "google.com";
      const photoUrl = "http://localhost/photo-from-idp.png";
      const idpSignIn = await signInWithFakeClaims(authApp, providerId, {
        sub: "123456789012345678901",
        email,
        email_verified: true,
        picture: photoUrl,
      });

      // It should sign-in into the same account and keep all providers and info.
      expect(idpSignIn.localId).to.equal(localId);
      const signInMethods = await getSigninMethods(authApp, email);
      expect(signInMethods).to.have.members([
        providerId,
        PROVIDER_PASSWORD,
        SIGNIN_METHOD_EMAIL_LINK,
      ]);

      const info = await getAccountInfoByIdToken(authApp, idpSignIn.idToken);
      expect(info.emailVerified).to.be.true; // Verified by IDP.

      // Profile attributes should be overwritten (if provided by IDP) or cleared.
      expect(info.photoUrl).to.equal(photoUrl);
      expect(info.displayName).to.be.undefined; // Not provided by IDP.
    });

    it("should return needConfirmation if both account and IDP has unverified email", async () => {
      // Given a user with unverified email:
      const email = "bar@example.com";
      const providerId1 = "facebook.com";
      const originalDisplayName = "Bar";
      const { localId, idToken } = await signInWithFakeClaims(authApp, providerId1, {
        sub: "123456789012345678901",
        email,
        email_verified: false,
        name: originalDisplayName,
      });

      // When signing in with IDP and IDP does not verify email:
      const providerId2 = "google.com";
      const fakeIdToken = JSON.stringify(
        fakeClaims({
          sub: "123456789012345678901",
          email,
          email_verified: false,
          name: "Foo",
          picture: "http://localhost/photo-from-idp.png",
        })
      );

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          requestUri: `http://localhost?providerId=${providerId2}&id_token=${encodeURIComponent(
            fakeIdToken
          )}`,
          returnIdpCredential: true,
        })
        .then((res) => {
          // It should fail to sign in with needConfirmation.
          expectStatusCode(200, res);
          expect(res.body.needConfirmation).to.equal(true);
          expect(res.body.localId).to.equal(localId);
          expect(res.body).not.to.have.property("idToken");
          expect(res.body.verifiedProvider).to.eql([providerId1]);
        });

      const signInMethods = await getSigninMethods(authApp, email);
      expect(signInMethods).to.have.members([providerId1]);
      expect(signInMethods).not.to.include([providerId2]);

      // Account should not be updated.
      const info = await getAccountInfoByIdToken(authApp, idToken);
      expect(info.emailVerified).to.be.false;
      expect(info.displayName).to.equal(originalDisplayName);
      expect(info.photoUrl).to.be.undefined;
    });

    it("should error when requestUri is missing or invalid", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
          /* no requestUri */
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("MISSING_REQUEST_URI");
        });
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
          requestUri: "notAnAbsoluteUriAndThusInvalid",
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("INVALID_REQUEST_URI");
        });
    });

    it("should error when missing providerId is missing", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
          requestUri: "http://localhost", // No providerId.
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.contain(
            "INVALID_CREDENTIAL_OR_PROVIDER_ID : Invalid IdP response/credential:"
          );
        });
    });

    it("should error when sub is missing or not a string", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          // No sub in token.
          postBody: `providerId=google.com&id_token=${JSON.stringify({})}`,
          requestUri: "http://localhost",
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.contain("INVALID_IDP_RESPONSE");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          // sub is not a string
          postBody: `providerId=google.com&id_token=${JSON.stringify({ sub: 12345 })}`,
          requestUri: "http://localhost",
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.contain("INVALID_IDP_RESPONSE");
        });
    });

    it("should link IDP to existing account by idToken", async () => {
      const user = await registerUser(authApp, {
        email: "foo@example.com",
        password: "notasecret",
      });
      const claims = fakeClaims({
        sub: "123456789012345678901",
        name: "Foo",
      });
      const fakeIdToken = JSON.stringify(claims);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken: user.idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(!!res.body.isNewUser).to.equal(false);
          expect(res.body.localId).to.equal(user.localId);
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [claims.sub],
              email: [user.email],
            });
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("google.com");
        });

      const signInMethods = await getSigninMethods(authApp, user.email);
      expect(signInMethods).to.have.members(["google.com", PROVIDER_PASSWORD]);
    });

    it("should copy IDP email to user-level email if not present", async () => {
      const user = await signInWithPhoneNumber(authApp, TEST_PHONE_NUMBER);
      const claims = fakeClaims({
        sub: "123456789012345678901",
        name: "Foo",
        email: "example@google.com",
      });
      const fakeIdToken = JSON.stringify(claims);
      const idToken = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken: user.idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(!!res.body.isNewUser).to.equal(false);
          expect(res.body.localId).to.equal(user.localId);
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [claims.sub],
              email: [claims.email],
              phone: [TEST_PHONE_NUMBER],
            });
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals("google.com");

          return res.body.idToken as string;
        });

      const info = await getAccountInfoByIdToken(authApp, idToken);
      expect(info.email).to.be.equal(claims.email);
      expect(!!info.emailVerified).to.be.equal(!!claims.email_verified);
    });

    it("should error if user to be linked is disabled", async () => {
      const user = await registerUser(authApp, {
        email: "foo@example.com",
        password: "notasecret",
      });
      await updateAccountByLocalId(authApp, user.localId, { disableUser: true });

      const claims = fakeClaims({
        sub: "123456789012345678901",
        name: "Foo",
      });
      const fakeIdToken = JSON.stringify(claims);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken: user.idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });

    it("should return error if IDP account is already linked to the same user", async () => {
      // Given a user with already linked with IDP account:
      const providerId = "google.com";
      const claims = {
        sub: "123456789012345678901",
        email: "alice@example.com",
        email_verified: false,
      };
      const { idToken } = await signInWithFakeClaims(authApp, providerId, claims);

      // When trying to link the same IDP account on the same user:
      const fakeIdToken = JSON.stringify(claims);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          returnIdpCredential: true, // Requests oauthIdToken etc. to be returned in a 200 response.
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.be.undefined;
          expect(res.body).not.to.have.property("refreshToken");

          expect(res.body.errorMessage).to.equal("FEDERATED_USER_ID_ALREADY_LINKED");
          expect(res.body.oauthIdToken).to.equal(fakeIdToken);
        });
    });

    it("should return error if IDP account is already linked to another user", async () => {
      // Given a user with already linked with IDP account:
      const providerId = "google.com";
      const claims = {
        sub: "123456789012345678901",
        email: "alice@example.com",
        email_verified: false,
      };
      await signInWithFakeClaims(authApp, providerId, claims);

      const user = await registerUser(authApp, {
        email: "foo@example.com",
        password: "notasecret",
      });
      // When trying to link the same IDP account on a different user:
      const fakeIdToken = JSON.stringify(claims);
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken: user.idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          // No returnIdpCredential, the response will be a 400 error.
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("FEDERATED_USER_ID_ALREADY_LINKED");
        });

      // Sign-in methods for either user should not be changed since linking failed.
      const signInMethods1 = await getSigninMethods(authApp, user.email);
      expect(signInMethods1).to.have.members([PROVIDER_PASSWORD]);
      const signInMethods2 = await getSigninMethods(authApp, claims.email);
      expect(signInMethods2).to.have.members([providerId]);
    });

    it("should return error if IDP account email already exists if NOT allowDuplicateEmail", async () => {
      // Given an existing account with the email:
      const email = "alice@example.com";
      await registerUser(authApp, { email, password: "notasecret" });

      // When trying to link an IDP account on a different user with the same email:
      const { idToken } = await registerAnonUser(authApp);
      const fakeIdToken = JSON.stringify(
        fakeClaims({
          sub: "12345",
          email,
        })
      );
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          // No returnIdpCredential, the response will be a 400 error.
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("EMAIL_EXISTS");
        });
    });

    it("should allow linking IDP account with same email to same user", async () => {
      // Given an existing account with the email:
      const email = "alice@example.com";
      const { idToken, localId } = await registerUser(authApp, { email, password: "notasecret" });

      // When trying to link an IDP account on user with the same email:
      const fakeIdToken = JSON.stringify(
        fakeClaims({
          sub: "12345",
          email,
          email_verified: true,
        })
      );
      const newIdToken = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);

          return res.body.idToken as string;
        });

      // Account email is now verified.
      const info = await getAccountInfoByIdToken(authApp, newIdToken);
      expect(info.emailVerified).to.be.true;
    });

    it("should allow linking IDP account with same email if allowDuplicateEmail", async () => {
      // Given an existing account with the email:
      const email = "alice@example.com";
      await registerUser(authApp, { email, password: "notasecret" });

      await updateProjectConfig(authApp, { signIn: { allowDuplicateEmails: true } });

      // When trying to link an IDP account on a different user with the same email:
      const { idToken, localId } = await registerAnonUser(authApp);
      const fakeIdToken = JSON.stringify(
        fakeClaims({
          sub: "12345",
          email,
        })
      );
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
        });
    });
  });

  describe("sign-in with custom token", () => {
    it("should create new account from custom token (unsigned)", async () => {
      const uid = "someuid";
      const claims = { abc: "def", ultimate: { answer: 42 } };
      const token = signJwt({ uid, claims }, "", {
        algorithm: "none",
        expiresIn: 3600,

        subject: "fake-service-account@example.com",
        issuer: "fake-service-account@example.com",
        audience: CUSTOM_TOKEN_AUDIENCE,
      });
      const idToken = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({ token })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.isNewUser).to.equal(true);
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const idToken = res.body.idToken as string;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals(PROVIDER_CUSTOM);
          expect(decoded!.payload).deep.include(claims);
          return idToken;
        });

      const info = await getAccountInfoByIdToken(authApp, idToken);
      expect(info.localId).to.equal(uid);
    });

    it("should sign into existing account and merge claims", async () => {
      // Given an email sign-in user with some custom claims:
      const email = "alice@example.com";
      const { localId } = await signInWithEmailLink(authApp, email);
      const customClaims = { abc: "abc", foo: "bar" };
      await updateAccountByLocalId(authApp, localId, {
        customAttributes: JSON.stringify(customClaims),
      });

      const claims = { abc: "def", ultimate: { answer: 42 } };
      const token = JSON.stringify({ uid: localId, claims });
      const refreshToken = await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({ token })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.isNewUser).to.equal(false);
          expect(res.body)
            .to.have.property("refreshToken")
            .that.is.a("string");

          const idToken = res.body.idToken as string;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload).not.to.have.property("provider_id");
          expect(decoded!.payload.firebase)
            .to.have.property("sign_in_provider")
            .equals(PROVIDER_CUSTOM);
          expect(decoded!.payload.firebase.identities).to.eql({
            email: [email],
          });
          expect(decoded!.payload).to.deep.include({
            // Claim values in custom token takes precedence over account-level.
            ...customClaims,
            ...claims,
          });
          return res.body.refreshToken as string;
        });

      // The claims also get attached to refreshed ID tokens.
      await supertest(authApp)
        .post("/securetoken.googleapis.com/v1/token")
        .type("form")
        .send({ refreshToken, grantType: "refresh_token" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          const idToken = res.body.id_token;
          expect(idToken).to.be.a("string");
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.payload).to.deep.include({
            ...customClaims,
            ...claims,
          });
        });
    });

    it("should error if custom token is missing", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({
          /* no token */
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("MISSING_CUSTOM_TOKEN");
        });
    });

    it("should error if custom token is invalid", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({ token: "{not+Json,That's=>For@Sure}" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("INVALID_CUSTOM_TOKEN");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({ token: "ThisMayLookLikeAJWT.ButItWontDecode.ToJsonObjects" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("INVALID_CUSTOM_TOKEN");
        });
    });

    it("should error if custom token addresses the wrong audience", async () => {
      const token = signJwt({ uid: "foo" }, "", {
        algorithm: "none",
        expiresIn: 3600,

        subject: "fake-service-account@example.com",
        issuer: "fake-service-account@example.com",
        audience: "http://localhost/not-the-firebase-auth-audience",
      });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({ token })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("INVALID_CUSTOM_TOKEN");
        });
    });

    it("should error if custom token contains no uid", async () => {
      const token = signJwt(
        {
          /* no uid */
        },
        "",
        {
          algorithm: "none",
          expiresIn: 3600,

          subject: "fake-service-account@example.com",
          issuer: "fake-service-account@example.com",
          audience: CUSTOM_TOKEN_AUDIENCE,
        }
      );

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({ token })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("MISSING_IDENTIFIER");
        });

      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({ token: '{"look": "I do not have uid"}' })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("MISSING_IDENTIFIER");
        });
    });

    it("should error if custom token contains forbidden claims", async () => {
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        // Contains forbidden claim "firebase".
        .send({ token: '{"uid": "wow", "claims": {"firebase": "awesome"}}' })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("FORBIDDEN_CLAIM : firebase");
        });
    });

    it("should error if user is disabled", async () => {
      // Given an email sign-in user with some custom claims:
      const email = "alice@example.com";
      const { localId } = await signInWithEmailLink(authApp, email);
      await updateAccountByLocalId(authApp, localId, { disableUser: true });

      const claims = { abc: "def", ultimate: { answer: 42 } };
      const token = JSON.stringify({ uid: localId, claims });
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
        .query({ key: "fake-api-key" })
        .send({ token })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equal("USER_DISABLED");
        });
    });
  });

  describe("accounts:query", () => {
    it("should return count of accounts when returnUserInfo is false", async () => {
      await registerAnonUser(authApp);
      await registerAnonUser(authApp);

      await supertest(authApp)
        .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:query`)
        .set("Authorization", "Bearer owner")
        .send({ returnUserInfo: false })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.recordsCount).to.equal("2"); // string (int64 format)
          expect(res.body).not.to.have.property("userInfo");
        });
    });

    it("should return accounts when returnUserInfo is true", async () => {
      const { localId } = await registerAnonUser(authApp);
      const user = { email: "alice@example.com", password: "notasecret" };
      const { localId: localId2 } = await registerUser(authApp, user);

      await supertest(authApp)
        .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:query`)
        .set("Authorization", "Bearer owner")
        .send({
          /* returnUserInfo is true by default */
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.recordsCount).to.equal("2"); // string (int64 format)
          expect(res.body.userInfo)
            .to.be.an.instanceof(Array)
            .with.lengthOf(2);

          const users = res.body.userInfo as UserInfo[];
          expect(users[0].localId < users[1].localId, "users are not sorted by ID ASC").to.be.true;
          const anonUser = users.find((x) => x.localId === localId);
          expect(anonUser, "cannot find first registered user").to.be.not.undefined;

          const emailUser = users.find((x) => x.localId === localId2);
          expect(emailUser, "cannot find second registered user").to.be.not.undefined;
          expect(emailUser!.email).to.equal(user.email);
        });
    });
  });

  describe("emulator utility APIs", () => {
    it("should drop all accounts on DELETE /emulator/v1/projects/{PROJECT_ID}/accounts", async () => {
      const user1 = await registerUser(authApp, {
        email: "alice@example.com",
        password: "notasecret",
      });
      const user2 = await registerUser(authApp, {
        email: "bob@example.com",
        password: "notasecret2",
      });
      await supertest(authApp)
        .delete(`/emulator/v1/projects/${PROJECT_ID}/accounts`)
        .set("Authorization", "Bearer owner")
        .send()
        .then((res) => expectStatusCode(200, res));

      await expectUserNotExistsForIdToken(authApp, user1.idToken);
      await expectUserNotExistsForIdToken(authApp, user2.idToken);
    });

    it("should return config on GET /emulator/v1/projects/{PROJECT_ID}/config", async () => {
      await supertest(authApp)
        .get(`/emulator/v1/projects/${PROJECT_ID}/config`)
        .send()
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("signIn")
            .eql({ allowDuplicateEmails: false /* default value */ });
        });
    });
    it("should update config on PATCH /emulator/v1/projects/{PROJECT_ID}/config", async () => {
      await supertest(authApp)
        .patch(`/emulator/v1/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({ signIn: { allowDuplicateEmails: true } })
        .then((res) => {
          expect(res.body)
            .to.have.property("signIn")
            .eql({ allowDuplicateEmails: true });
        });
      await supertest(authApp)
        .patch(`/emulator/v1/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({ signIn: { allowDuplicateEmails: false } })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body)
            .to.have.property("signIn")
            .eql({ allowDuplicateEmails: false });
        });
    });
  });

  describe("REST API mapping", () => {
    it("should handle integer values for enums", async () => {
      // Proto integer value for "EMAIL_SIGNIN". Android client SDK sends this.
      const requestType = 6;
      await supertest(authApp)
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
        .set("Authorization", "Bearer owner")
        .send({ email: "bob@example.com", requestType, returnOobLink: true })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.oobLink).to.include("mode=signIn");
        });
    });

    it("should handle integer values for enums (legacy API path)", async () => {
      // Proto integer value for "EMAIL_SIGNIN". Android client SDK sends this.
      const requestType = 6;
      await supertest(authApp)
        .post("/www.googleapis.com/identitytoolkit/v3/relyingparty/getOobConfirmationCode")
        .set("Authorization", "Bearer owner")
        .send({ email: "bob@example.com", requestType, returnOobLink: true })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.oobLink).to.include("mode=signIn");
        });
    });
  });
});

function expectStatusCode(expected: number, res: supertest.Response): void {
  if (res.status !== expected) {
    const body = inspect(res.body);
    throw new AssertionError(
      `expected ${expected} "${STATUS_CODES[expected]}", got ${res.status} "${
        STATUS_CODES[res.status]
      }", with response body:\n${body}`
    );
  }
}

function fakeClaims(input: Partial<IdpJwtPayload> & { sub: string }): IdpJwtPayload {
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

function registerUser(
  authApp: Express.Application,
  user: { email: string; password: string; displayName?: string }
): Promise<{ idToken: string; localId: string; refreshToken: string; email: string }> {
  return supertest(authApp)
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

function registerAnonUser(
  authApp: Express.Application
): Promise<{ idToken: string; localId: string; refreshToken: string }> {
  return supertest(authApp)
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

async function signInWithEmailLink(
  authApp: Express.Application,
  email: string,
  idTokenToLink?: string
): Promise<{ idToken: string; localId: string; refreshToken: string; email: string }> {
  const { oobCode } = await createEmailSignInOob(authApp, email);

  return supertest(authApp)
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

async function signInWithPhoneNumber(
  authApp: Express.Application,
  phoneNumber: string
): Promise<{ idToken: string; localId: string; refreshToken: string }> {
  const sessionInfo = await supertest(authApp)
    .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
    .query({ key: "fake-api-key" })
    .send({ phoneNumber, recaptchaToken: "ignored" })
    .then((res) => {
      expectStatusCode(200, res);
      return res.body.sessionInfo;
    });

  const codes = await inspectVerificationCodes(authApp);

  return supertest(authApp)
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

function signInWithFakeClaims(
  authApp: Express.Application,
  providerId: string,
  claims: Partial<IdpJwtPayload> & { sub: string }
): Promise<{ idToken: string; localId: string; refreshToken: string; email?: string }> {
  const fakeIdToken = JSON.stringify(fakeClaims(claims));
  return supertest(authApp)
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

async function expectUserNotExistsForIdToken(
  authApp: Express.Application,
  idToken: string
): Promise<void> {
  await supertest(authApp)
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(400, res);
      expect(res.body.error)
        .to.have.property("message")
        .equals("USER_NOT_FOUND");
    });
}

async function expectIdTokenExpired(authApp: Express.Application, idToken: string): Promise<void> {
  await supertest(authApp)
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(400, res);
      expect(res.body.error)
        .to.have.property("message")
        .equals("TOKEN_EXPIRED");
    });
}

function getAccountInfoByIdToken(authApp: Express.Application, idToken: string): Promise<UserInfo> {
  return supertest(authApp)
    .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
    .send({ idToken })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(200, res);
      expect(res.body.users).to.have.length(1);
      return res.body.users[0];
    });
}

function inspectOobs(authApp: Express.Application): Promise<OobRecord[]> {
  return supertest(authApp)
    .get(`/emulator/v1/projects/${PROJECT_ID}/oobCodes`)
    .then((res) => {
      expectStatusCode(200, res);
      return res.body.oobCodes;
    });
}

function inspectVerificationCodes(
  authApp: Express.Application
): Promise<PhoneVerificationRecord[]> {
  return supertest(authApp)
    .get(`/emulator/v1/projects/${PROJECT_ID}/verificationCodes`)
    .then((res) => {
      expectStatusCode(200, res);
      return res.body.verificationCodes;
    });
}

function createEmailSignInOob(
  authApp: Express.Application,
  email: string
): Promise<{ oobCode: string; oobLink: string }> {
  return supertest(authApp)
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

function getSigninMethods(authApp: Express.Application, email: string): Promise<string[]> {
  return supertest(authApp)
    .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
    .send({ continueUri: "http://example.com/", identifier: email })
    .query({ key: "fake-api-key" })
    .then((res) => {
      expectStatusCode(200, res);
      return res.body.signinMethods;
    });
}

function updateProjectConfig(authApp: Express.Application, config: {}): Promise<void> {
  return supertest(authApp)
    .patch(`/emulator/v1/projects/${PROJECT_ID}/config`)
    .set("Authorization", "Bearer owner")
    .send(config)
    .then((res) => {
      expectStatusCode(200, res);
    });
}

function updateAccountByLocalId(
  authApp: Express.Application,
  localId: string,
  fields: {}
): Promise<void> {
  return supertest(authApp)
    .post("/identitytoolkit.googleapis.com/v1/accounts:update")
    .set("Authorization", "Bearer owner")
    .send({ localId, ...fields })
    .then((res) => {
      expectStatusCode(200, res);
    });
}
