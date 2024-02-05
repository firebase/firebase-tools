import { expect } from "chai";
import { decode as decodeJwt } from "jsonwebtoken";
import { describeAuthEmulator } from "./setup";
import {
  enrollPhoneMfa,
  expectStatusCode,
  getAccountInfoByIdToken,
  getAccountInfoByLocalId,
  getSigninMethods,
  PROJECT_ID,
  registerAnonUser,
  registerUser,
  signInWithEmailLink,
  signInWithFakeClaims,
  signInWithPassword,
  signInWithPhoneNumber,
  TEST_PHONE_NUMBER,
  updateAccountByLocalId,
  registerTenant,
} from "./helpers";
import { UserInfo } from "../../../emulator/auth/state";

describeAuthEmulator("accounts:batchGet", ({ authApi }) => {
  it("should allow listing all accounts", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), { email: "foo@example.com", password: "foobar" });

    await authApi()
      .get(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`)
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(2);
        expect(res.body.users.map((user: UserInfo) => user.localId)).to.have.members([
          user1.localId,
          user2.localId,
        ]);

        // No more accounts after this, so no page token returned.
        expect(res.body).not.to.have.property("nextPageToken");
      });
  });

  it("should return MFA info", async () => {
    const user1 = await signInWithEmailLink(authApi(), "test@example.com");
    await enrollPhoneMfa(authApi(), user1.idToken, TEST_PHONE_NUMBER);

    await authApi()
      .get(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`)
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        const user = res.body.users[0] as UserInfo;
        expect(user.mfaInfo![0]).to.contain({
          enrolledAt: "1970-01-01T00:00:00.000Z",
          phoneInfo: TEST_PHONE_NUMBER,
          unobfuscatedPhoneInfo: TEST_PHONE_NUMBER,
        });
      });
  });

  it("should allow listing all accounts using legacy endpoint", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), { email: "foo@example.com", password: "foobar" });

    await authApi()
      .post("/www.googleapis.com/identitytoolkit/v3/relyingparty/downloadAccount")
      .set("Authorization", "Bearer owner")
      .send({ targetProjectId: PROJECT_ID })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(2);
        expect(res.body.users.map((user: UserInfo) => user.localId)).to.have.members([
          user1.localId,
          user2.localId,
        ]);

        // No more accounts after this, so no page token returned.
        expect(res.body).not.to.have.property("nextPageToken");
      });
  });

  it("should allow specifying maxResults and pagination", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), { email: "foo@example.com", password: "foobar" });
    const localIds = [user1.localId, user2.localId].sort();

    const nextPageToken = await authApi()
      .get(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`)
      .query({ maxResults: 1 }) // Give me the first user only.
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].localId).to.equal(localIds[0]);

        expect(res.body).to.have.property("nextPageToken").which.is.a("string");
        return res.body.nextPageToken as string;
      });

    await authApi()
      .get(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`)
      .query({ nextPageToken })
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].localId).to.equal(localIds[1]);

        // No more accounts after this, so no page token returned.
        expect(res.body).not.to.have.property("nextPageToken");
      });

    // Test the legacy API too to make sure nextPageToken is recognized.
    await authApi()
      .post("/www.googleapis.com/identitytoolkit/v3/relyingparty/downloadAccount")
      .set("Authorization", "Bearer owner")
      .send({ targetProjectId: PROJECT_ID, nextPageToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].localId).to.equal(
          user1.localId > user2.localId ? user1.localId : user2.localId,
        );

        // No more accounts after this, so no page token returned.
        expect(res.body).not.to.have.property("nextPageToken");
      });
  });

  it("should always return a page token if page is full", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), { email: "foo@example.com", password: "foobar" });
    const localIds = [user1.localId, user2.localId].sort();

    const nextPageToken = await authApi()
      .get(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`)
      .query({ maxResults: 2 }) // Return first two users only.
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(2);
        expect(res.body.users[0].localId).to.equal(localIds[0]);
        expect(res.body.users[1].localId).to.equal(localIds[1]);

        // Even if there are no more users after this page, we should still
        // return a page token to match production behavior. See:
        // https://github.com/firebase/firebase-tools/issues/3231
        expect(res.body).to.have.property("nextPageToken").which.is.a("string");
        return res.body.nextPageToken as string;
      });

    await authApi()
      .get(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`)
      .query({ nextPageToken })
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        // Empty page with no page token returned.
        expect(res.body.users || []).to.have.length(0);
        expect(res.body).not.to.have.property("nextPageToken");
      });
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .get(
        `/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/tenants/${tenant.tenantId}/accounts:batchGet`,
      )
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").includes("PROJECT_DISABLED");
      });
  });
});

describeAuthEmulator("accounts:batchCreate", ({ authApi }) => {
  it("should create specified accounts", async () => {
    const user1 = { localId: "foo", email: "foo@example.com", rawPassword: "notasecret" };
    const user2 = {
      localId: "bar",
      phoneNumber: TEST_PHONE_NUMBER,
      customAttributes: '{"hello": "world"}',
    };
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users: [user1, user2] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const user1SignInMethods = await getSigninMethods(authApi(), user1.email);
    expect(user1SignInMethods).to.eql(["password"]);

    const user2SignIn = await signInWithPhoneNumber(authApi(), user2.phoneNumber);
    expect(user2SignIn.localId).to.equal(user2.localId);

    expect(decodeJwt(user2SignIn.idToken)).to.have.property("hello").equal("world");
  });

  it("should create specified accounts via legacy endpoint", async () => {
    const user1 = { localId: "foo", email: "foo@example.com", rawPassword: "notasecret" };
    const user2 = { localId: "bar", phoneNumber: TEST_PHONE_NUMBER };
    await authApi()
      .post("/www.googleapis.com/identitytoolkit/v3/relyingparty/uploadAccount")
      .set("Authorization", "Bearer owner")
      .send({ users: [user1, user2], targetProjectId: PROJECT_ID })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const user1SignInMethods = await getSigninMethods(authApi(), user1.email);
    expect(user1SignInMethods).to.eql(["password"]);

    const user2SignIn = await signInWithPhoneNumber(authApi(), user2.phoneNumber);
    expect(user2SignIn.localId).to.equal(user2.localId);
  });

  it("should error if users is empty or missing", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users: [] })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_USER_ACCOUNT");
      });
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        /* no users */
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_USER_ACCOUNT");
      });
  });

  it("should convert emails to lowercase", async () => {
    const user = { localId: "foo", email: "FOO@EXAMPLE.COM", rawPassword: "notasecret" };
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users: [user] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const userInfo = await getAccountInfoByLocalId(authApi(), user.localId);
    expect(userInfo.email).to.eql(user.email.toLowerCase());
  });

  it("should accept Auth Emulator fake passwordHash from request", async () => {
    const password = "hawaii";
    const salt = "beach";
    const user = {
      localId: "foo",
      email: "FOO@EXAMPLE.COM",
      salt,
      // Auth Emulator specific fake hash format, works for signInWithPassword.
      passwordHash: `fakeHash:salt=${salt}:password=${password}`,
    };
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users: [user] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const userInfo = await getAccountInfoByLocalId(authApi(), user.localId);
    expect(userInfo.passwordHash).to.eql(user.passwordHash);
    expect(userInfo.salt).to.eql(user.salt);

    const userSignIn = await signInWithPassword(authApi(), user.email, password);
    expect(userSignIn.localId).to.equal(user.localId);
  });

  it.skip("should reject production passwordHash", async () => {
    const user = {
      localId: "foo",
      email: "FOO@EXAMPLE.COM",

      // Real hashes from production, which the Auth Emulator cannot actually
      // import and check against without access to signer keys.
      passwordHash:
        "T8cY66FE7V0ejwZqdYH6OgQO8ZiMwqQ2XW-wgUUDf3LNfNPz1Uu6vlwak8GzSd295SmtuQV54qDdidSKYLx7Cg==",
      salt: "nteWfb8brZ0NIA==",
    };
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users: [user] })
      .then((res) => {
        expectStatusCode(200, res);
        // TODO: Can we do better than silently importing it in broken state?
        expect(res.body.error || []).to.have.length(0);
      });
  });

  it("should error for duplicate emails in payload if sanityCheck is true", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        sanityCheck: true, // Check for duplicates in list below:
        users: [
          { localId: "test1", email: "foo@example.com" },
          { localId: "test2", email: "foo@example.com" }, // duplicate email
        ],
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equal("DUPLICATE_EMAIL : foo@example.com");
      });
  });

  it("should block reusing existing email if sanityCheck is true", async () => {
    // Existing user:
    const user = await signInWithEmailLink(authApi(), "bar@example.com");
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        sanityCheck: true,
        users: [{ localId: "test1", email: user.email }],
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error).to.eql([
          {
            index: 0,
            message: "email exists in other account in database",
          },
        ]);
      });
  });

  it("should error for duplicate providerId+rawIds in payload if sanityCheck is true", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        sanityCheck: true, // Check for duplicates in list below:
        users: [
          { localId: "test1", providerUserInfo: [{ providerId: "google.com", rawId: "dup" }] },
          { localId: "test2", providerUserInfo: [{ providerId: "google.com", rawId: "dup" }] },
        ],
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equal("DUPLICATE_RAW_ID : Provider id(google.com), Raw id(dup)");
      });
  });

  it("should block reusing exisiting providerId+rawIds if sanityCheck is true", async () => {
    const providerId = "google.com";
    const rawId = "0123456";
    // Existing user:
    await signInWithFakeClaims(authApi(), providerId, { sub: rawId });
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        sanityCheck: true,
        users: [{ localId: "test1", providerUserInfo: [{ providerId, rawId }] }],
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error).to.eql([
          {
            index: 0,
            message: "raw id exists in other account in database",
          },
        ]);
      });
  });

  it("should block duplicate localIds by default", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        users: [
          { localId: "test1" },
          { localId: "test1" }, // duplicate
        ],
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equal("DUPLICATE_LOCAL_ID : test1");
      });

    const { localId } = await registerAnonUser(authApi());
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        users: [{ localId /* duplicate with existing in DB */ }],
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error).eql([
          {
            index: 0,
            message: "localId belongs to an existing account - can not overwrite.",
          },
        ]);
      });
  });

  it("should not error for empty MFA info", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        users: [{ localId: "test1", mfaInfo: [] }],
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });
  });

  it("should return error for individual invalid entries", async () => {
    const longString = new Array(999).join("x");

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        users: [
          { email: "foo@example.com" /* no localId */ },
          { localId: "test1" }, // valid
          { localId: "test2", email: "not#an$email" },
          { localId: "test3", phoneNumber: "not#a$phone%number" },
          { localId: "test4", customAttributes: "not#a$json%object" },
          { localId: "test5", customAttributes: '{"sub": "123"}' }, // sub field is forbidden
          { localId: "test6", customAttributes: `{"a":"${longString}"}` }, // too large
          {
            localId: "test7",
            providerUserInfo: [{ providerId: "google.com" /* missing rawId */ }],
          },
          { localId: "test8", providerUserInfo: [{ rawId: "012345" /* missing providerId */ }] },
          // federatedId without rawId / providerId is supported in production but not Auth Emulator.
          { localId: "test9", providerUserInfo: [{ federatedId: "foo-bar" }] },
          {
            // MFA without email
            localId: "test10",
            mfaInfo: [{ phoneInfo: TEST_PHONE_NUMBER }],
          },
          {
            // MFA but email is unverified
            localId: "test11",
            email: "someone@example.com",
            mfaInfo: [{ phoneInfo: TEST_PHONE_NUMBER }],
          },
        ],
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error).eql([
          {
            index: 0,
            message: "localId is missing",
          },
          {
            index: 2,
            message: "email is invalid",
          },
          {
            index: 3,
            message: "phone number format is invalid",
          },
          {
            index: 4,
            message: "Invalid custom claims provided.",
          },
          {
            index: 5,
            message: "Custom claims provided include a reserved claim.",
          },
          {
            index: 6,
            message: "Custom claims provided are too large.",
          },
          {
            index: 7,
            message: "federatedId or (providerId & rawId) is required",
          },
          {
            index: 8,
            message: "federatedId or (providerId & rawId) is required",
          },
          {
            index: 9,
            message:
              "((Parsing federatedId is not implemented in Auth Emulator; please specify providerId AND rawId as a workaround.))",
          },
          {
            index: 10,
            message: "Second factor account requires email to be presented.",
          },
          {
            index: 11,
            message: "Second factor account requires email to be verified.",
          },
        ]);
      });
  });

  it("should overwrite users with matching localIds if allowOverwrite", async () => {
    const user1ToBeOverwritten = await signInWithFakeClaims(authApi(), "google.com", {
      sub: "doh",
    });
    const user2ToBeOverwritten = await registerUser(authApi(), {
      email: "bar@example.com",
      password: "hawaii",
      displayName: "Old Display Name",
    });

    const user1 = {
      localId: user1ToBeOverwritten.localId,
      email: "foo@example.com",
      rawPassword: "notasecret",
    };
    const user2 = {
      localId: user2ToBeOverwritten.localId,
      phoneNumber: TEST_PHONE_NUMBER,
      displayName: "New Display Name",
    };
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users: [user1, user2], allowOverwrite: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const user1Info = await getAccountInfoByLocalId(authApi(), user1.localId);
    expect(user1Info.email).to.eql(user1.email);
    expect(user1Info.providerUserInfo).to.eql([
      {
        providerId: "password",
        rawId: "foo@example.com",
        email: "foo@example.com",
        federatedId: "foo@example.com",
      },
      // Note: previous google.com link was gone since it is not present in new userInfo.
    ]);

    const user2SignIn = await signInWithPhoneNumber(authApi(), user2.phoneNumber);
    expect(user2SignIn.localId).to.equal(user2.localId);

    const user2Info = await getAccountInfoByIdToken(authApi(), user2SignIn.idToken);
    expect(user2Info.email || "").to.be.empty; // gone
    expect(user2Info.passwordHash || "").to.be.empty; // gone
    expect(user2Info.displayName).to.equal(user2.displayName); // overwritten
  });

  it("should import identity provider info", async () => {
    const email = "foo@example.com";
    const providerId = "google.com";
    const rawId = "0123456";
    const user1 = {
      localId: "foo",
      email,
      providerUserInfo: [{ providerId, rawId, displayName: "Foo", email }],
    };
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users: [user1] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const user1SignInMethods = await getSigninMethods(authApi(), user1.email);
    expect(user1SignInMethods).to.eql([providerId]);

    const user1SignIn = await signInWithFakeClaims(authApi(), providerId, {
      sub: rawId,
    });
    expect(user1SignIn.localId).to.equal(user1.localId);
  });

  it("should import MFA info", async () => {
    const email = "foo@example.com";
    const user1 = {
      localId: "foo",
      email,
      emailVerified: true,
      mfaInfo: [
        {
          enrolledAt: "2123-04-05T06:07:28.990Z",
          phoneInfo: TEST_PHONE_NUMBER,
        },
      ],
    };
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users: [user1] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const user1Info = await getAccountInfoByLocalId(authApi(), user1.localId);
    expect(user1Info.mfaInfo).to.have.length(1);
    expect(user1Info.mfaInfo![0]).to.contain({
      enrolledAt: user1.mfaInfo[0].enrolledAt,
      phoneInfo: TEST_PHONE_NUMBER,
      unobfuscatedPhoneInfo: TEST_PHONE_NUMBER,
    });
    // A mfaEnrollmentId should be automatically generated if not provided.
    expect(user1Info.mfaInfo![0].mfaEnrollmentId).to.be.a("string").and.not.empty;
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").includes("PROJECT_DISABLED");
      });
  });

  it("should error if user tenantId does not match state tenantId", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: false });

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        tenantId: tenant.tenantId,
        users: [{ localId: "test1", tenantId: "not-matching-tenant-id" }],
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error).eql([
          {
            index: 0,
            message: "Tenant id in userInfo does not match the tenant id in request.",
          },
        ]);
      });
  });

  it("should create users with tenantId if present", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: false });
    const user = {
      localId: "foo",
      email: "me@example.com",
      rawPassword: "notasecret",
    };

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ tenantId: tenant.tenantId, users: [user] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const userInfo = await getAccountInfoByLocalId(authApi(), user.localId, tenant.tenantId);
    expect(userInfo.tenantId).to.eql(tenant.tenantId);
  });
});

describeAuthEmulator("accounts:batchDelete", ({ authApi }) => {
  it("should delete specified disabled accounts", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), {
      email: "foobar@example.com",
      password: "barbaz",
    });
    await updateAccountByLocalId(authApi(), user1.localId, { disableUser: true });
    await updateAccountByLocalId(authApi(), user2.localId, { disableUser: true });

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`)
      .set("Authorization", "Bearer owner")
      .send({ localIds: [user1.localId, user2.localId] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.errors ?? []).to.be.empty;
      });
  });

  it("should error for accounts not disabled", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), {
      email: "foobar@example.com",
      password: "barbaz",
    });
    // User 1 not disabled.
    await updateAccountByLocalId(authApi(), user2.localId, { disableUser: true });

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`)
      .set("Authorization", "Bearer owner")
      .send({ localIds: [user1.localId, user2.localId] })
      .then((res) => {
        expectStatusCode(200, res);

        expect(res.body.errors).to.eql([
          {
            index: 0,
            localId: user1.localId,
            message: "NOT_DISABLED : Disable the account before batch deletion.",
          },
        ]);
      });
  });

  it("should delete disabled and not disabled accounts with force: true", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), {
      email: "foobar@example.com",
      password: "barbaz",
    });
    // User 1 not disabled.
    await updateAccountByLocalId(authApi(), user2.localId, { disableUser: true });

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`)
      .set("Authorization", "Bearer owner")
      .send({ localIds: [user1.localId, user2.localId], force: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.errors ?? []).to.be.empty;
      });
  });

  it("should not report errors for nonexistent localIds", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`)
      .set("Authorization", "Bearer owner")
      .send({ localIds: ["nosuch", "nosuch2"] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.errors ?? []).to.be.empty;
      });

    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`)
      .set("Authorization", "Bearer owner")
      .send({ localIds: ["nosuch", "nosuch2"], force: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.errors ?? []).to.be.empty;
      });
  });

  it("should error if localIds array is empty", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`)
      .set("Authorization", "Bearer owner")
      .send({ localIds: [], force: true })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("LOCAL_ID_LIST_EXCEEDS_LIMIT");
      });
  });

  it("should error if localId count is more than limit", async () => {
    const localIds = [];
    for (let i = 0; i < 1000; i++) {
      localIds.push(`localId-${i}`);
    }

    // Right at limit (no error).
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`)
      .set("Authorization", "Bearer owner")
      .send({ localIds, force: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.errors ?? []).to.be.empty;
      });

    // One above limit (error).
    localIds.push("extraOne");
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchDelete`)
      .set("Authorization", "Bearer owner")
      .send({ localIds, force: true })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("LOCAL_ID_LIST_EXCEEDS_LIMIT");
      });
  });
});
