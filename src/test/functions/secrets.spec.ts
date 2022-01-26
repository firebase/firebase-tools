import * as sinon from "sinon";
import { expect } from "chai";

import * as secretManager from "../../gcp/secretManager";
import * as secrets from "../../functions/secrets";
import * as utils from "../../utils";
import * as prompt from "../../prompt";
import { Options } from "../../options";
import { FirebaseError } from "../../error";

describe("functions/secret", () => {
  const options = { force: false } as Options;

  describe("ensureValidKey", () => {
    let warnStub: sinon.SinonStub;

    beforeEach(() => {
      warnStub = sinon.stub(utils, "logWarning").resolves(undefined);
    });

    afterEach(() => {
      warnStub.restore();
    });

    it("returns the original key if it follows convention", () => {
      expect(secrets.ensureValidKey("MY_KEY", options)).to.equal("MY_KEY");
      expect(warnStub).to.not.have.been.called;
    });

    it("returns the transformed key (with warning) if with dashses", () => {
      expect(secrets.ensureValidKey("MY-KEY", options)).to.equal("MY_KEY");
      expect(warnStub).to.have.been.calledOnce;
    });

    it("returns the transformed key (with warning) if with lower cases", () => {
      expect(secrets.ensureValidKey("my_key", options)).to.equal("MY_KEY");
      expect(warnStub).to.have.been.calledOnce;
    });

    it("returns the transformed key (with warning) if camelCased", () => {
      expect(secrets.ensureValidKey("myKey", options)).to.equal("MY_KEY");
      expect(warnStub).to.have.been.calledOnce;
    });

    it("throws error if given non-conventional key w/ forced option", () => {
      expect(() => secrets.ensureValidKey("throwError", { ...options, force: true })).to.throw(
        FirebaseError
      );
    });
  });

  describe("ensureSecret", () => {
    const secret: secretManager.Secret = {
      projectId: "project-id",
      name: "MY_SECRET",
      labels: secrets.labels(),
    };

    let sandbox: sinon.SinonSandbox;
    let getStub: sinon.SinonStub;
    let createStub: sinon.SinonStub;
    let patchStub: sinon.SinonStub;
    let promptStub: sinon.SinonStub;
    let warnStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();

      getStub = sandbox.stub(secretManager, "getSecret").rejects("Unexpected call");
      createStub = sandbox.stub(secretManager, "createSecret").rejects("Unexpected call");
      patchStub = sandbox.stub(secretManager, "patchSecret").rejects("Unexpected call");

      promptStub = sandbox.stub(prompt, "promptOnce").resolves(true);
      warnStub = sandbox.stub(utils, "logWarning").resolves(undefined);
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    it("returns existing secret if we have one", async () => {
      getStub.resolves(secret);

      await expect(
        secrets.ensureSecret("project-id", "MY_SECRET", options)
      ).to.eventually.deep.equal(secret);
      expect(getStub).to.have.been.calledOnce;
    });

    it("prompt user to have Firebase manage the secret if not managed by Firebase", async () => {
      getStub.resolves({ ...secret, labels: [] });
      patchStub.resolves(secret);

      await expect(
        secrets.ensureSecret("project-id", "MY_SECRET", options)
      ).to.eventually.deep.equal(secret);
      expect(warnStub).to.have.been.calledOnce;
      expect(promptStub).to.have.been.calledOnce;
    });

    it("creates a new secret if it doesn't exists", async () => {
      getStub.rejects({ status: 404 });
      createStub.resolves(secret);

      await expect(
        secrets.ensureSecret("project-id", "MY_SECRET", options)
      ).to.eventually.deep.equal(secret);
    });

    it("throws if it cannot reach Secret Manager", async () => {
      getStub.rejects({ status: 500 });

      await expect(secrets.ensureSecret("project-id", "MY_SECRET", options)).to.eventually.be
        .rejected;
    });
  });
});
