import { expect } from "chai";
import * as sinon from "sinon";
import { updateUser } from "./update_user";
import * as auth from "../../../auth";
import { FirebaseError } from "../../../error";

describe("updateUser", () => {
  let setCustomUserClaims: sinon.SinonStub;
  let updateUserDisabled: sinon.SinonStub;

  beforeEach(() => {
    setCustomUserClaims = sinon.stub(auth, "setCustomUserClaims");
    updateUserDisabled = sinon.stub(auth, "updateUserDisabled");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should disable a user", async () => {
    updateUserDisabled.resolves({ uid: "123", disabled: true });

    const result = await updateUser({ uid: "123", disabled: true });

    expect(result).to.deep.equal({ uid: "123", disabled: true });
    expect(updateUserDisabled).to.have.been.calledWith("123", true);
    expect(setCustomUserClaims).to.not.have.been.called;
  });

  it("should enable a user", async () => {
    updateUserDisabled.resolves({ uid: "123", disabled: false });

    const result = await updateUser({ uid: "123", disabled: false });

    expect(result).to.deep.equal({ uid: "123", disabled: false });
    expect(updateUserDisabled).to.have.been.calledWith("123", false);
    expect(setCustomUserClaims).to.not.have.been.called;
  });

  it("should set a custom claim", async () => {
    setCustomUserClaims.resolves({ uid: "123", customClaims: { admin: true } });

    const result = await updateUser({
      uid: "123",
      claim: "admin",
      claimValue: "true",
    });

    expect(result).to.deep.equal({ uid: "123", customClaims: { admin: true } });
    expect(setCustomUserClaims).to.have.been.calledWith("123", { admin: true });
    expect(updateUserDisabled).to.not.have.been.called;
  });

  it("should set a custom claim and disable a user", async () => {
    setCustomUserClaims.resolves({ uid: "123", customClaims: { admin: true } });
    updateUserDisabled.resolves({ uid: "123", disabled: true });

    const result = await updateUser({
      uid: "123",
      claim: "admin",
      claimValue: "true",
      disabled: true,
    });

    expect(result).to.deep.equal({
      uid: "123",
      customClaims: { admin: true },
      disabled: true,
    });
    expect(setCustomUserClaims).to.have.been.calledWith("123", { admin: true });
    expect(updateUserDisabled).to.have.been.calledWith("123", true);
  });

  it("should set a custom claim and enable a user", async () => {
    setCustomUserClaims.resolves({ uid: "123", customClaims: { admin: true } });
    updateUserDisabled.resolves({ uid: "123", disabled: false });

    const result = await updateUser({
      uid: "123",
      claim: "admin",
      claimValue: "true",
      disabled: false,
    });

    expect(result).to.deep.equal({
      uid: "123",
      customClaims: { admin: true },
      disabled: false,
    });
    expect(setCustomUserClaims).to.have.been.calledWith("123", { admin: true });
    expect(updateUserDisabled).to.have.been.calledWith("123", false);
  });

  it("should throw an error if no uid is provided", async () => {
    await expect(updateUser({} as any)).to.be.rejectedWith(
      FirebaseError,
      "uid is required",
    );
  });

  it("should throw an error if claim is provided without claimValue", async () => {
    await expect(
      updateUser({ uid: "123", claim: "admin" } as any),
    ).to.be.rejectedWith(FirebaseError, "claim and claimValue must be used together");
  });

  it("should throw an error if claimValue is provided without claim", async () => {
    await expect(
      updateUser({ uid: "123", claimValue: "true" } as any),
    ).to.be.rejectedWith(FirebaseError, "claim and claimValue must be used together");
  });

  it("should throw an error if claimValue is not valid JSON", async () => {
    await expect(
      updateUser({ uid: "123", claim: "admin", claimValue: "not-json" }),
    ).to.be.rejectedWith(FirebaseError, "claimValue must be a valid JSON object.");
  });
});
