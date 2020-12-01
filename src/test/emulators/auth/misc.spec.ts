import { expect } from "chai";
import { UserInfo } from "../../../emulator/auth/state";
import { PROJECT_ID } from "./helpers";
import { describeAuthEmulator } from "./setup";
import {
  expectStatusCode,
  registerUser,
  registerAnonUser,
  updateAccountByLocalId,
  expectUserNotExistsForIdToken,
} from "./helpers";

describeAuthEmulator("token refresh", ({ authApi }) => {
  it("should exchange refresh token for new tokens", async () => {
    const { refreshToken, localId } = await registerAnonUser(authApi());
    await authApi()
      .post("/securetoken.googleapis.com/v1/token")
      .type("form")
      // snake_case parameters also work, per OAuth 2.0 spec.
      // eslint-disable-next-line @typescript-eslint/camelcase
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
      .set("Authorization", "Bearer owner")
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
      .set("Authorization", "Bearer owner")
      .send({ signIn: { allowDuplicateEmails: true } })
      .then((res) => {
        expect(res.body)
          .to.have.property("signIn")
          .eql({ allowDuplicateEmails: true });
      });
    await authApi()
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
