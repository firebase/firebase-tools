import { expect } from "chai";
import * as sinon from "sinon";
import * as backend from "../../apphosting/backend";
import { Config } from "../../config";
import * as prompt from "../../prompt";
import { promptExistingBackend, upsertAppHostingConfig } from "./apphosting";
import { FirebaseError } from "../../error";

const TEST_PROJECT_ID = "project-1234";

describe("apphosting", () => {
  let promptOnceStub: sinon.SinonStub;
  let getBackendStub: sinon.SinonStub;

  beforeEach(() => {
    promptOnceStub = sinon.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    getBackendStub = sinon.stub(backend, "getBackend").throws("Unexpected getBackend call");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("promptExistingBackend", () => {
    it("re-prompts when we fail to find the backend", async () => {
      promptOnceStub.onFirstCall().resolves("incorrect-backend-name");
      promptOnceStub.onSecondCall().resolves("correct-backend-name");
      getBackendStub.onFirstCall().rejects(new FirebaseError("backend not found"));
      getBackendStub.onSecondCall().resolves();

      await promptExistingBackend(TEST_PROJECT_ID);

      expect(promptOnceStub.calledTwice).to.be.true;
    });
  });

  describe("upsertAppHostingConfig", () => {
    it("creates App Hosting section in firebase.json if no previous config exists", () => {
      const config = new Config({}, { projectDir: "test", cwd: "test" });
      const backendConfig = {
        backendId: "my-backend",
        rootDir: "/",
        ignore: [],
      };

      upsertAppHostingConfig(backendConfig, config);

      expect(config.src.apphosting).to.deep.equal(backendConfig);
    });

    it("converts App Hosting config into array when going from one backend to two", () => {
      const existingBackendConfig = {
        backendId: "my-backend",
        rootDir: "/",
        ignore: [],
      };
      const config = new Config(
        { apphosting: existingBackendConfig },
        { projectDir: "test", cwd: "test" },
      );
      const newBackendConfig = {
        backendId: "my-backend-1",
        rootDir: "/",
        ignore: [],
      };

      upsertAppHostingConfig(newBackendConfig, config);

      expect(config.src.apphosting).to.deep.equal([existingBackendConfig, newBackendConfig]);
    });

    it("appends backend config to array if there is already an array", () => {
      const appHostingConfig = [
        {
          backendId: "my-backend-0",
          rootDir: "/",
          ignore: [],
        },
        {
          backendId: "my-backend-1",
          rootDir: "/",
          ignore: [],
        },
      ];
      const config = new Config(
        { apphosting: appHostingConfig },
        { projectDir: "test", cwd: "test" },
      );
      const newBackendConfig = {
        backendId: "my-backend-2",
        rootDir: "/",
        ignore: [],
      };

      upsertAppHostingConfig(newBackendConfig, config);

      expect(config.src.apphosting).to.deep.equal([...appHostingConfig, newBackendConfig]);
    });
  });
}).timeout(5000);
