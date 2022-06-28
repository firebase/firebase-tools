/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
import {
  expectStatusCode,
  registerUser,
  signInWithFakeClaims,
  getSigninMethods,
  expectUserNotExistsForIdToken,
  registerTenant,
} from "./helpers";

describeAuthEmulator("accounts:delete", ({ authApi }) => {
  it("should delete the user of the idToken", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .send({ idToken })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("error");
      });

    await expectUserNotExistsForIdToken(authApi(), idToken);
  });

  it("should error when trying to delete by localId without OAuth", async () => {
    const { localId } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .send({ localId })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_ID_TOKEN");
      });
  });

  it("should remove federated accounts for user", async () => {
    const email = "alice@example.com";
    const providerId = "google.com";
    const sub = "12345";
    const { localId, idToken } = await signInWithFakeClaims(authApi(), providerId, {
      sub,
      email,
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .query({ key: "fake-api-key" })
      .send({ idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("error");
      });

    expect(await getSigninMethods(authApi(), email)).to.be.empty;

    const signInAgain = await signInWithFakeClaims(authApi(), providerId, {
      sub,
      email,
    });
    expect(signInAgain.localId).not.to.equal(localId);
  });

  it("should delete the user by localId if OAuth credentials are present", async () => {
    const { localId, idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .set("Authorization", "Bearer owner")
      .send({ localId })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("error");
      });

    await expectUserNotExistsForIdToken(authApi(), idToken);
  });

  it("should error if missing localId when OAuth credentials are present", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .set("Authorization", "Bearer owner")
      .send({ idToken /* no localId */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_LOCAL_ID");
      });
  });

  it("should delete the user of the idToken", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .send({ tenantId: tenant.tenantId })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").includes("PROJECT_DISABLED");
      });
  });
});
