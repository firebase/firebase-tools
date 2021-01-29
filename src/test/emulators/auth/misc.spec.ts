import { expect } from "chai";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { UserInfo } from "../../../emulator/auth/state";
import { PROJECT_ID, signInWithPhoneNumber, TEST_PHONE_NUMBER } from "./helpers";
import { describeAuthEmulator } from "./setup";
import {
  expectStatusCode,
  registerUser,
  registerAnonUser,
  updateAccountByLocalId,
  expectUserNotExistsForIdToken,
} from "./helpers";
import {
  FirebaseJwtPayload,
  SESSION_COOKIE_MAX_VALID_DURATION,
} from "../../../emulator/auth/operations";
import { toUnixTimestamp } from "../../../emulator/auth/utils";

describeAuthEmulator("token refresh", ({ authApi }) => {
  it("should exchange refresh token for new tokens", async () => {
    const { refreshToken, localId } = await registerAnonUser(authApi());
    await authApi()
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
    const { refreshToken, localId } = await registerAnonUser(authApi());
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    await authApi()
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

describeAuthEmulator("createSessionCookie", ({ authApi }) => {
  it("should return a valid sessionCookie", async () => {
    const { idToken } = await registerAnonUser(authApi());
    const validDuration = 7777; /* seconds */

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}:createSessionCookie`)
      .set("Authorization", "Bearer owner")
      .send({ idToken, validDuration: validDuration.toString() })
      .then((res) => {
        expectStatusCode(200, res);
        const sessionCookie = res.body.sessionCookie;
        expect(sessionCookie).to.be.a("string");

        const decoded = decodeJwt(sessionCookie, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "session cookie is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.iat).to.equal(toUnixTimestamp(new Date()));
        expect(decoded!.payload.exp).to.equal(toUnixTimestamp(new Date()) + validDuration);
        expect(decoded!.payload.iss).to.equal(`https://session.firebase.google.com/${PROJECT_ID}`);

        const idTokenProps = decodeJwt(idToken) as Partial<FirebaseJwtPayload>;
        delete idTokenProps.iss;
        delete idTokenProps.iat;
        delete idTokenProps.exp;
        expect(decoded!.payload).to.deep.contain(idTokenProps);
      });
  });

  it("should throw if idToken is missing", async () => {
    const validDuration = 7777; /* seconds */

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}:createSessionCookie`)
      .set("Authorization", "Bearer owner")
      .send({ validDuration: validDuration.toString() /* no idToken */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("MISSING_ID_TOKEN");
      });
  });

  it("should throw if idToken is invalid", async () => {
    const validDuration = 7777; /* seconds */

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}:createSessionCookie`)
      .set("Authorization", "Bearer owner")
      .send({ idToken: "invalid", validDuration: validDuration.toString() })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_ID_TOKEN");
      });
  });

  it("should use default session cookie validDuration if not specified", async () => {
    const { idToken } = await registerAnonUser(authApi());
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}:createSessionCookie`)
      .set("Authorization", "Bearer owner")
      .send({ idToken })
      .then((res) => {
        expectStatusCode(200, res);
        const sessionCookie = res.body.sessionCookie;
        expect(sessionCookie).to.be.a("string");

        const decoded = decodeJwt(sessionCookie, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "session cookie is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.exp).to.equal(
          toUnixTimestamp(new Date()) + SESSION_COOKIE_MAX_VALID_DURATION
        );
      });
  });

  it("should throw if validDuration is too short or too long", async () => {
    const { idToken } = await registerAnonUser(authApi());
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}:createSessionCookie`)
      .set("Authorization", "Bearer owner")
      .send({ idToken, validDuration: "1" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_DURATION");
      });

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}:createSessionCookie`)
      .set("Authorization", "Bearer owner")
      .send({ idToken, validDuration: "999999999999" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_DURATION");
      });
  });
});

describeAuthEmulator("accounts:lookup", ({ authApi }) => {
  it("should return user by localId when privileged", async () => {
    const { localId } = await registerAnonUser(authApi());

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`)
      .set("Authorization", "Bearer owner")
      .send({ localId: [localId] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].localId).to.equal(localId);
      });
  });

  it("should deduplicate users", async () => {
    const { localId } = await registerAnonUser(authApi());

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`)
      .set("Authorization", "Bearer owner")
      .send({ localId: [localId, localId] /* two with the same id */ })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].localId).to.equal(localId);
      });
  });

  it("should return providerUserInfo for phone auth users", async () => {
    const { localId } = await signInWithPhoneNumber(authApi(), TEST_PHONE_NUMBER);

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`)
      .set("Authorization", "Bearer owner")
      .send({ localId: [localId] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].providerUserInfo).to.eql([
          {
            phoneNumber: TEST_PHONE_NUMBER,
            rawId: TEST_PHONE_NUMBER,
            providerId: "phone",
          },
        ]);
      });
  });

  it("should return empty result when localId is not found", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`)
      .set("Authorization", "Bearer owner")
      .send({ localId: ["noSuchId"] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("users");
      });
  });
});

describeAuthEmulator("accounts:query", ({ authApi }) => {
  it("should return count of accounts when returnUserInfo is false", async () => {
    await registerAnonUser(authApi());
    await registerAnonUser(authApi());

    await authApi()
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
    const { localId } = await registerAnonUser(authApi());
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId: localId2 } = await registerUser(authApi(), user);

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:query`)
      .set("Authorization", "Bearer owner")
      .send({
        /* returnUserInfo is true by default */
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.recordsCount).to.equal("2"); // string (int64 format)
        expect(res.body.userInfo).to.be.an.instanceof(Array).with.lengthOf(2);

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

describeAuthEmulator("emulator utility APIs", ({ authApi }) => {
  it("should drop all accounts on DELETE /emulator/v1/projects/{PROJECT_ID}/accounts", async () => {
    const user1 = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });
    const user2 = await registerUser(authApi(), {
      email: "bob@example.com",
      password: "notasecret2",
    });
    await authApi()
      .delete(`/emulator/v1/projects/${PROJECT_ID}/accounts`)
      .send()
      .then((res) => expectStatusCode(200, res));

    await expectUserNotExistsForIdToken(authApi(), user1.idToken);
    await expectUserNotExistsForIdToken(authApi(), user2.idToken);
  });

  it("should return config on GET /emulator/v1/projects/{PROJECT_ID}/config", async () => {
    await authApi()
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
    await authApi()
      .patch(`/emulator/v1/projects/${PROJECT_ID}/config`)
      .send({ signIn: { allowDuplicateEmails: true } })
      .then((res) => {
        expect(res.body).to.have.property("signIn").eql({ allowDuplicateEmails: true });
      });
    await authApi()
      .patch(`/emulator/v1/projects/${PROJECT_ID}/config`)
      .send({ signIn: { allowDuplicateEmails: false } })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("signIn").eql({ allowDuplicateEmails: false });
      });
  });
});
