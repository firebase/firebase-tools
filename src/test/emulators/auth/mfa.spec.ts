import { expect } from "chai";
import { describeAuthEmulator } from "./setup";
import {
  enrollPhoneMfa,
  expectStatusCode,
  getAccountInfoByIdToken,
  inspectVerificationCodes,
  registerUser,
  signInWithEmailLink,
  TEST_PHONE_NUMBER,
  TEST_PHONE_NUMBER_OBFUSCATED,
} from "./helpers";
import { MfaEnrollment } from "../../../emulator/auth/types";

// Many JWT fields from IDPs use snake_case and we need to match that.

describeAuthEmulator("mfa enrollment", ({ authApi }) => {
  it("should allow phone enrollment for an existing account", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    const { idToken } = await signInWithEmailLink(authApi(), "foo@example.com");
    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneEnrollmentInfo: { phoneNumber } })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.phoneSessionInfo.sessionInfo).to.be.a("string");
        return res.body.phoneSessionInfo.sessionInfo as string;
      });

    const codes = await inspectVerificationCodes(authApi());
    expect(codes).to.have.length(1);
    expect(codes[0].phoneNumber).to.equal(phoneNumber);
    expect(codes[0].sessionInfo).to.equal(sessionInfo);
    expect(codes[0].code).to.be.a("string");
    const { code } = codes[0];

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneVerificationInfo: { code, sessionInfo } })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
        expect(res.body.refreshToken).to.be.a("string");
      });

    const userInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(userInfo.mfaInfo).to.be.an("array").with.lengthOf(1);
    expect(userInfo.mfaInfo![0].phoneInfo).to.equal(phoneNumber);
  });

  it("should allow sign-in with pending credential for MFA-enabled user", async () => {
    const email = "foo@example.com";
    const password = "abcdef";
    const { idToken } = await registerUser(authApi(), { email, password });
    await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER);

    const { mfaPendingCredential, enrollment } = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email, password })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
        const mfaPendingCredential = res.body.mfaPendingCredential as string;
        const mfaInfo = res.body.mfaInfo as MfaEnrollment[];
        expect(mfaPendingCredential).to.be.a("string");
        expect(mfaInfo).to.be.an("array").with.lengthOf(1);
        expect(mfaInfo[0]?.phoneInfo).to.equal(TEST_PHONE_NUMBER_OBFUSCATED);

        // This must not be exposed right after first factor login.
        expect(mfaInfo[0]?.phoneInfo).not.to.have.property("unobfuscatedPhoneInfo");
        return { mfaPendingCredential, enrollment: mfaInfo[0] };
      });

    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start")
      .query({ key: "fake-api-key" })
      .send({
        mfaEnrollmentId: enrollment.mfaEnrollmentId,
        mfaPendingCredential,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.phoneResponseInfo.sessionInfo).to.be.a("string");
        return res.body.phoneResponseInfo.sessionInfo as string;
      });

    const code = (await inspectVerificationCodes(authApi()))[0].code;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({
        mfaPendingCredential,
        phoneVerificationInfo: {
          sessionInfo,
          code: code,
        },
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
        expect(res.body.refreshToken).to.be.a("string");
      });
  });
});
