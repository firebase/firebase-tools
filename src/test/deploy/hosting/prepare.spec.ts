import { expect } from "chai";
import * as sinon from "sinon";
import * as clc from "colorette";

import { FirebaseConfig } from "../../../firebaseConfig";
import { HostingOptions } from "../../../hosting/options";
import { Context } from "../../../deploy/hosting/context";
import { Options } from "../../../options";
import * as hostingApi from "../../../hosting/api";
import * as tracking from "../../../track";
import * as deploymentTool from "../../../deploymentTool";
import * as config from "../../../hosting/config";
import * as utils from "../../../utils";
import {
  addPinnedFunctionsToOnlyString,
  hasPinnedFunctions,
  prepare,
  unsafePins,
} from "../../../deploy/hosting/prepare";
import { cloneDeep } from "../../../utils";
import * as backend from "../../../deploy/functions/backend";

describe("hosting prepare", () => {
  let hostingStub: sinon.SinonStubbedInstance<typeof hostingApi>;
  let trackingStub: sinon.SinonStubbedInstance<typeof tracking>;
  let backendStub: sinon.SinonStubbedInstance<typeof backend>;
  let loggerStub: sinon.SinonStub;
  let siteConfig: config.HostingResolved;
  let firebaseJson: FirebaseConfig;
  let options: HostingOptions & Options;

  beforeEach(() => {
    hostingStub = sinon.stub(hostingApi);
    trackingStub = sinon.stub(tracking);
    backendStub = sinon.stub(backend);
    loggerStub = sinon.stub(utils, "logLabeledBullet");

    // We're intentionally using pointer references so that editing site
    // edits the results of hostingConfig() and changes firebase.json
    siteConfig = {
      site: "site",
      public: ".",
      rewrites: [
        {
          glob: "run",
          run: {
            serviceId: "service",
            pinTag: true,
          },
        },
        {
          glob: "**",
          function: {
            functionId: "function",
            pinTag: true,
          },
        },
      ],
    };
    firebaseJson = {
      hosting: siteConfig,
    };
    options = {
      cwd: ".",
      configPath: ".",
      only: "hosting",
      except: "",
      filteredTargets: ["HOSTING"],
      force: false,
      json: false,
      nonInteractive: false,
      interactive: true,
      debug: false,
      config: {
        src: firebaseJson,
      } as any,
      rc: null as any,

      // Forces caching behavior of hostingConfig call
      normalizedHostingConfig: [siteConfig],
    };
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("passes a smoke test with web framework", async () => {
    siteConfig.webFramework = "fake-framework";

    // Edit the in-memory config to add a web framework
    hostingStub.createVersion.callsFake((siteId, version) => {
      expect(siteId).to.equal(siteConfig.site);
      expect(version.status).to.equal("CREATED");
      expect(version.labels).to.deep.equal({
        ...deploymentTool.labels(),
        "firebase-web-framework": "fake-framework",
      });
      return Promise.resolve("version");
    });

    const context: Context = {
      projectId: "project",
    };
    await prepare(context, options);

    expect(trackingStub.trackGA4).to.have.been.calledOnceWith("hosting_version", {
      framework: "fake-framework",
    });
    expect(hostingStub.createVersion).to.have.been.calledOnce;
    expect(context.hosting).to.deep.equal({
      deploys: [
        {
          config: siteConfig,
          version: "version",
        },
      ],
    });
    expect(loggerStub).to.have.been.calledWith(
      "hosting",
      `The site ${clc.bold("site")} will pin rewrites to the current latest ` +
        `revision of service(s) ${clc.bold("service")}`,
    );
  });

  it("passes a smoke test without web framework", async () => {
    // Do not set a web framework on siteConfig

    // Edit the in-memory config to add a web framework
    hostingStub.createVersion.callsFake((siteId, version) => {
      expect(siteId).to.equal(siteConfig.site);
      expect(version.status).to.equal("CREATED");
      // Note: we're missing the web framework label
      expect(version.labels).to.deep.equal(deploymentTool.labels());
      return Promise.resolve("version");
    });

    const context: Context = {
      projectId: "project",
    };
    await prepare(context, options);

    expect(trackingStub.trackGA4).to.have.been.calledOnceWith("hosting_version", {
      framework: "classic",
    });
    expect(hostingStub.createVersion).to.have.been.calledOnce;
    expect(context.hosting).to.deep.equal({
      deploys: [
        {
          config: siteConfig,
          version: "version",
        },
      ],
    });
  });

  describe("unsafePins", () => {
    const apiRewriteWithoutPin: hostingApi.Rewrite = {
      glob: "**",
      run: {
        serviceId: "service",
        region: "us-central1",
      },
    };
    const apiRewriteWithPin = cloneDeep(apiRewriteWithoutPin);
    apiRewriteWithPin.run.tag = "tag";
    const configWithRunPin: config.HostingResolved = {
      site: "site",
      rewrites: [
        {
          glob: "**",
          run: {
            serviceId: "service",
            pinTag: true,
          },
        },
      ],
    };
    const configWithFuncPin: config.HostingResolved = {
      site: "site",
      rewrites: [
        {
          glob: "**",
          function: {
            functionId: "function",
            pinTag: true,
          },
        },
      ],
    };

    beforeEach(() => {
      backendStub.existingBackend.resolves({
        endpoints: {
          "us-central1": {
            function: {
              id: "function",
              runServiceId: "service",
            } as unknown as backend.Endpoint,
          },
        },
        requiredAPIs: [],
        environmentVariables: {},
      });
    });

    function stubUnpinnedRewrite(): void {
      stubRewrite(apiRewriteWithoutPin);
    }

    function stubPinnedRewrite(): void {
      stubRewrite(apiRewriteWithPin);
    }

    function stubRewrite(rewrite: hostingApi.Rewrite): void {
      hostingStub.getChannel.resolves({
        release: {
          version: {
            config: {
              rewrites: [rewrite],
            },
          },
        },
      } as unknown as hostingApi.Channel);
    }

    it("does not care about modifying live (implicit)", async () => {
      stubUnpinnedRewrite();
      await expect(unsafePins({ projectId: "project" }, configWithRunPin)).to.eventually.deep.equal(
        [],
      );
    });

    it("does not care about modifying live (explicit)", async () => {
      stubUnpinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "live" }, configWithRunPin),
      ).to.eventually.deep.equal([]);
    });

    it("does not care about already pinned rewrites (run)", async () => {
      stubPinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "test" }, configWithRunPin),
      ).to.eventually.deep.equal([]);
    });

    it("does not care about already pinned rewrites (gcf)", async () => {
      stubPinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "test" }, configWithFuncPin),
      ).to.eventually.deep.equal([]);
    });

    it("rejects about newly pinned rewrites (run)", async () => {
      stubUnpinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "test" }, configWithRunPin),
      ).to.eventually.deep.equal(["**"]);
    });

    it("rejects about newly pinned rewrites (gcf)", async () => {
      stubUnpinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "test" }, configWithFuncPin),
      ).to.eventually.deep.equal(["**"]);
    });
  });

  describe("hasPinnedFunctions", () => {
    it("detects function tags", () => {
      expect(hasPinnedFunctions(options)).to.be.true;
    });

    it("detects a lack of function tags", () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      delete (options as any).config.src.hosting?.rewrites?.[1]?.function?.pinTag;
      expect(hasPinnedFunctions(options)).to.be.false;
    });
  });

  describe("addPinnedFunctionsToOnlyString", () => {
    it("adds functions to deploy targets w/ codebases", async () => {
      backendStub.existingBackend.resolves({
        endpoints: {
          "us-central1": {
            function: {
              id: "function",
              runServiceId: "service",
              codebase: "backend",
            } as unknown as backend.Endpoint,
          },
        },
        requiredAPIs: [],
        environmentVariables: {},
      });

      await expect(addPinnedFunctionsToOnlyString({} as any, options)).to.eventually.be.true;
      expect(options.only).to.equal("hosting,functions:backend:function");
      expect(loggerStub).to.have.been.calledWith(
        "hosting",
        `The following function(s) are pinned to site ${clc.bold("site")} ` +
          `and will be deployed as well: ${clc.bold("function")}`,
      );
    });

    it("adds functions to deploy targets w/o codebases", async () => {
      backendStub.existingBackend.resolves({
        endpoints: {
          "us-central1": {
            function: {
              id: "function",
              runServiceId: "service",
            } as unknown as backend.Endpoint,
          },
        },
        requiredAPIs: [],
        environmentVariables: {},
      });

      await expect(addPinnedFunctionsToOnlyString({} as any, options)).to.eventually.be.true;
      expect(options.only).to.equal("hosting,functions:default:function");
    });

    it("doesn't add untagged functions", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      delete (siteConfig as any).rewrites[1].function.pinTag;

      await expect(addPinnedFunctionsToOnlyString({} as any, options)).to.eventually.be.false;
      expect(options.only).to.equal("hosting");
      expect(backendStub.existingBackend).to.not.have.been.called;
    });
  });
});
