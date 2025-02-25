import { expect } from "chai";
import * as sinon from "sinon";

import { setEnabled } from "../../experiments";
import { FirebaseConfig } from "../../firebaseConfig";
import * as frameworks from "../../frameworks";
import * as config from "../../hosting/config";
import { HostingOptions } from "../../hosting/options";
import { Options } from "../../options";
import { matchesHostingTarget, prepareFrameworksIfNeeded } from "../index";

describe("hosting prepare", () => {
  let frameworksStub: sinon.SinonStubbedInstance<typeof frameworks>;
  let classicSiteConfig: config.HostingResolved;
  let webFrameworkSiteConfig: config.HostingResolved;
  let firebaseJson: FirebaseConfig;
  let options: HostingOptions & Options;

  beforeEach(() => {
    frameworksStub = sinon.stub(frameworks);

    // We're intentionally using pointer references so that editing site
    // edits the results of hostingConfig() and changes firebase.json
    classicSiteConfig = {
      site: "classic",
      target: "classic",
      public: ".",
    };
    webFrameworkSiteConfig = {
      site: "webframework",
      target: "webframework",
      source: "src",
    };
    firebaseJson = {
      hosting: [classicSiteConfig, webFrameworkSiteConfig],
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
      projectId: "project",
      config: {
        src: firebaseJson,
        get: (key: string) => {
          if (key === "hosting") {
            return firebaseJson.hosting;
          }
          return null;
        },
      } as any,
      rc: null as any,

      // Forces caching behavior of hostingConfig call
      normalizedHostingConfig: [classicSiteConfig, webFrameworkSiteConfig],
    };
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("matchesHostingTarget", () => {
    it("should correctly identify if a hosting target should be included in deployment", () => {
      const cases = [
        { only: "hosting:site1", target: "site1", expected: true },
        { only: "hosting:site12", target: "site1", expected: false },
        { only: "hosting:", target: "", expected: true },
        { only: "functions:fn1", target: "site1", expected: true },
        { only: "hosting:site1,hosting:site2", target: "site1", expected: true },
        { only: undefined, target: "site1", expected: true },
        { only: "hosting:site1,functions:fn1", target: "site1", expected: true },
      ];

      cases.forEach(({ only, target, expected }) => {
        expect(matchesHostingTarget(only, target)).to.equal(expected);
      });
    });
  });

  it("deploys classic site without webframeworks disabled", async () => {
    setEnabled("webframeworks", false);
    options.only = "hosting:classic";
    await expect(prepareFrameworksIfNeeded(["hosting"], options, {})).to.not.be.rejected;
  });

  it("fails webframework deploy with webframeworks disabled", async () => {
    setEnabled("webframeworks", false);
    options.only = "hosting:webframework";
    await expect(prepareFrameworksIfNeeded(["hosting"], options, {})).to.be.rejectedWith(
      /Cannot deploy a web framework from source because the experiment.+webframeworks.+is not enabled/,
    );
  });

  it("deploys webframework site with webframeworks enabled", async () => {
    setEnabled("webframeworks", true);
    options.only = "hosting:webframework";
    await expect(prepareFrameworksIfNeeded(["hosting"], options, {})).to.not.be.rejected;
    expect(frameworksStub.prepareFrameworks).to.have.been.calledOnceWith("deploy", ["hosting"]);
  });

  it("deploys classic site with webframeworks enabled", async () => {
    setEnabled("webframeworks", true);
    options.only = "hosting:classic";
    await expect(prepareFrameworksIfNeeded(["hosting"], options, {})).to.not.be.rejected;
    expect(frameworksStub.prepareFrameworks).to.not.have.been.called;
  });

  it("fails when at least one site has webframeworks enabled and the experiment is disabled", async () => {
    setEnabled("webframeworks", false);
    options.only = "hosting";
    await expect(prepareFrameworksIfNeeded(["hosting"], options, {})).to.be.rejectedWith(
      /Cannot deploy a web framework from source because the experiment.+webframeworks.+is not enabled/,
    );
  });
});
