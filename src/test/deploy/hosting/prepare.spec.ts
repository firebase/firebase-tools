import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseConfig } from "../../../firebaseConfig";
import { HostingOptions } from "../../../hosting/options";
import { Context } from "../../../deploy/hosting/context";
import { Options } from "../../../options";
import * as hostingApi from "../../../hosting/api";
import * as tracking from "../../../track";
import * as deploymentTool from "../../../deploymentTool";
import * as config from "../../../hosting/config";
import { prepare, unsafePins } from "../../../deploy/hosting/prepare";
import { cloneDeep } from "../../../utils";
import * as backend from "../../../deploy/functions/backend";

describe("hosting prepare", () => {
  let hostingStub: sinon.SinonStubbedInstance<typeof hostingApi>;
  let trackingStub: sinon.SinonStubbedInstance<typeof tracking>;
  let siteConfig: config.HostingResolved;
  let firebaseJson: FirebaseConfig;
  let options: HostingOptions & Options;

  beforeEach(() => {
    hostingStub = sinon.stub(hostingApi);
    trackingStub = sinon.stub(tracking);

    // We're intentionally using pointer references so that editing site
    // edits the results of hostingConfig() and changes firebase.json
    siteConfig = {
      site: "site",
      public: ".",
    };
    firebaseJson = {
      hosting: siteConfig,
    };
    options = {
      cwd: ".",
      configPath: ".",
      only: "",
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

    expect(trackingStub.track).to.have.been.calledOnceWith("hosting_deploy", "fake-framework");
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

    expect(trackingStub.track).to.have.been.calledOnceWith("hosting_deploy", "classic");
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

    let backendStub: sinon.SinonStubbedInstance<typeof backend>;

    beforeEach(() => {
      backendStub = sinon.stub(backend);
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
        []
      );
    });

    it("does not care about modifying live (explicit)", async () => {
      stubUnpinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "live" }, configWithRunPin)
      ).to.eventually.deep.equal([]);
    });

    it("does not care about already pinned rewrites (run)", async () => {
      stubPinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "test" }, configWithRunPin)
      ).to.eventually.deep.equal([]);
    });

    it("does not care about already pinned rewrites (gcf)", async () => {
      stubPinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "test" }, configWithFuncPin)
      ).to.eventually.deep.equal([]);
    });

    it("rejects about newly pinned rewrites (run)", async () => {
      stubUnpinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "test" }, configWithRunPin)
      ).to.eventually.deep.equal(["**"]);
    });

    it("rejects about newly pinned rewrites (gcf)", async () => {
      stubUnpinnedRewrite();
      await expect(
        unsafePins({ projectId: "project", hostingChannel: "test" }, configWithFuncPin)
      ).to.eventually.deep.equal(["**"]);
    });
  });
});
