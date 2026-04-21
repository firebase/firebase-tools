import { expect } from "chai";
import * as sinon from "sinon";
import { askQuestions, actuate } from "./auth";
import * as prompt from "../../prompt";
import { Config } from "../../config";
import { Setup } from "../index";

describe("init/features/auth", () => {
  let checkboxStub: sinon.SinonStub;
  let inputStub: sinon.SinonStub;
  let configSetStub: sinon.SinonStub;
  let configWriteStub: sinon.SinonStub;

  beforeEach(() => {
    checkboxStub = sinon.stub(prompt, "checkbox");
    inputStub = sinon.stub(prompt, "input");
    configSetStub = sinon.stub(Config.prototype, "set");
    configWriteStub = sinon.stub(Config.prototype, "writeProjectFile");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("askQuestions", () => {
    it("should handle email provider selection", async () => {
      checkboxStub.resolves(["email"]);
      const setup = { config: {} } as unknown as Setup;

      await askQuestions(setup);

      expect(setup.featureInfo.auth.providers.emailPassword).to.be.true;
      expect(setup.featureInfo.auth.providers.anonymous).to.be.undefined;
    });

    it("should handle Google provider selection and prompts", async () => {
      checkboxStub.resolves(["google"]);
      inputStub.onFirstCall().resolves("My Cool App");
      inputStub.onSecondCall().resolves("support@app.com");
      const setup = { config: {}, project: { projectId: "my-proj" } } as unknown as Setup;

      await askQuestions(setup);

      expect(setup.featureInfo.auth.providers.googleSignIn.oAuthBrandDisplayName).to.equal(
        "My Cool App",
      );
      expect(setup.featureInfo.auth.providers.googleSignIn.supportEmail).to.equal(
        "support@app.com",
      );
    });
  });

  describe("actuate", () => {
    it("should generate firebase.json configuration", async () => {
      const setup = {
        featureInfo: {
          auth: { providers: { emailPassword: true } },
        },
      } as unknown as Setup;
      const config = new Config({}, {});

      await actuate(setup, config);

      expect(configSetStub).to.have.been.calledWith("auth", setup.featureInfo.auth);
      expect(configWriteStub).to.have.been.calledOnce;
    });

    it("should do nothing if no auth config in featureInfo", async () => {
      const setup = {} as unknown as Setup;
      const config = new Config({}, {});

      await actuate(setup, config);

      expect(configSetStub).to.not.have.been.called;
    });
  });
});
