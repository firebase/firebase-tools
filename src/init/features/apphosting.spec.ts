import { expect } from "chai";
import * as sinon from "sinon";
import { Config } from "../../config";
import { upsertAppHostingConfig } from "./apphosting";

describe("apphosting", () => {
  afterEach(() => {
    sinon.verifyAndRestore();
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
