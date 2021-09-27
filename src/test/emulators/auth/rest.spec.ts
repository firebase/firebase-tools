import { expect } from "chai";
import { expectStatusCode } from "./helpers";
import { describeAuthEmulator } from "./setup";

describeAuthEmulator("REST API mapping", ({ authApi }) => {
  it("should respond to status checks", async () => {
    await authApi()
      .get("/")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.authEmulator).to.be.an("object");
      });
  });

  it("should allow cross-origin requests", async () => {
    await authApi()
      .options("/")
      .set("Origin", "example.com")
      .set("Access-Control-Request-Headers", "Authorization,X-Client-Version,X-Whatever-Header")
      .then((res) => {
        expectStatusCode(204, res);

        // Some clients (including older browsers and jsdom) won't accept '*' as a
        // wildcard, so we need to reflect Origin and Access-Control-Request-Headers.
        // https://github.com/firebase/firebase-tools/issues/3200
        expect(res.header["access-control-allow-origin"]).to.eql("example.com");
        expect((res.header["access-control-allow-headers"] as string).split(",")).to.have.members([
          "Authorization",
          "X-Client-Version",
          "X-Whatever-Header",
        ]);
      });
  });

  it("should handle integer values for enums", async () => {
    // Proto integer value for "EMAIL_SIGNIN". Android client SDK sends this.
    const requestType = 6;
    await authApi()
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
    await authApi()
      .post("/www.googleapis.com/identitytoolkit/v3/relyingparty/getOobConfirmationCode")
      .set("Authorization", "Bearer owner")
      .send({ email: "bob@example.com", requestType, returnOobLink: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.oobLink).to.include("mode=signIn");
      });
  });

  it("should convert numbers to strings for type:string fields", async () => {
    // validSince should be an int64-formatted string, but Node.js Admin SDK
    // sends it as a plain number (without quotes).
    const validSince = 1611780718;
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId: "nosuch", validSince })
      .then((res) => {
        expectStatusCode(400, res);
        // It should pass JSON schema validation and get into handler logic.
        expect(res.body.error.message).to.equal("USER_NOT_FOUND");
      });
  });
});

describeAuthEmulator("authentication", ({ authApi }) => {
  it("should throw 403 if API key is not provided", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .query({
        /* no API "key" */
      })
      .send({ returnSecureToken: true })
      .then((res) => {
        expectStatusCode(403, res);
        expect(res.body.error).to.have.property("status").equal("PERMISSION_DENIED");
      });
  });

  it("should ignore non-Bearer Authorization headers", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      // This has no effect on the request handling, since it is not Bearer.
      .set("Authorization", "Basic YWxhZGRpbjpvcGVuc2VzYW1l")
      .query({
        /* no API "key" */
      })
      .send({ returnSecureToken: true })
      .then((res) => {
        expectStatusCode(403, res);
        expect(res.body.error).to.have.property("status").equal("PERMISSION_DENIED");
      });
  });

  it("should treat Bearer owner as authenticated to project", async () => {
    await authApi()
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
    await authApi()
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
    await authApi()
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
    await authApi()
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

  // TODO(lisajian): uncomment when tenant endpoints are added
  // it.only("should deny requests where tenant IDs do not match", async () => {
  //   await authApi()
  //     .post(
  //       "/identitytoolkit.googleapis.com/v1/projects/project-id/tenants/tenant-id/accounts:delete"
  //     )
  //     .set("Authorization", "Bearer owner")
  //     .send({ localId: "local-id", tenantId: "mismatching-tenant-id" })
  //     .then((res) => {
  //       expectStatusCode(400, res);
  //       expect(res.body.error).to.have.property("message").equals("TENANT_ID_MISMATCH");
  //     });
  // });
});
