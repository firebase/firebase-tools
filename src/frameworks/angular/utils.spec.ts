import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { expect } from "chai";
import * as sinon from "sinon";

import {
  getBuilderType,
  BuilderType,
  getAngular22SsrSecurityWarning,
  formatAngular22SsrSecurityWarning,
  ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS,
  extractAngular22AllowedHostsFromBuildOptions,
  readAngular22ServerEntrySource,
  maybeWarnAngular22SsrSecurity,
  Angular22SsrSecurityIO,
} from "./utils";
import * as frameworkUtils from "../utils";

describe("Angular utils", () => {
  describe("getBuilderType", () => {
    it("should return the correct builder type for valid builders", () => {
      expect(getBuilderType("@angular-devkit/build-angular:browser")).to.equal(BuilderType.BROWSER);
      expect(getBuilderType("@angular-devkit/build-angular:server")).to.equal(BuilderType.SERVER);
      expect(getBuilderType("@angular-devkit/build-angular:dev-server")).to.equal(
        BuilderType.DEV_SERVER,
      );
      expect(getBuilderType("@angular-devkit/build-angular:ssr-dev-server")).to.equal(
        BuilderType.SSR_DEV_SERVER,
      );
      expect(getBuilderType("@angular-devkit/build-angular:prerender")).to.equal(
        BuilderType.PRERENDER,
      );
      expect(getBuilderType("@angular-devkit/build-angular:application")).to.equal(
        BuilderType.APPLICATION,
      );
      expect(getBuilderType("@angular-devkit/build-angular:browser-esbuild")).to.equal(
        BuilderType.BROWSER_ESBUILD,
      );
      expect(getBuilderType("@angular-devkit/build-angular:deploy")).to.equal(BuilderType.DEPLOY);
    });

    it("should return null for invalid builders", () => {
      expect(getBuilderType("@angular-devkit/build-angular:invalid")).to.be.null;
      expect(getBuilderType("invalid")).to.be.null;
      expect(getBuilderType(":")).to.be.null;
      expect(getBuilderType("::")).to.be.null;
      expect(getBuilderType("random:string")).to.be.null;
    });

    it("should handle builders with no colon", () => {
      expect(getBuilderType("@angular-devkit/build-angular")).to.be.null;
    });
  });

  describe("getAngular22SsrSecurityWarning", () => {
    const baseOpts = {
      version: "22.0.0",
      ssr: true,
      buildOptionsAllowedHosts: undefined as string[] | undefined,
      serverEntrySource: undefined as string | undefined,
    };

    it("returns undefined when Angular version is missing", () => {
      const result = getAngular22SsrSecurityWarning({ ...baseOpts, version: undefined });
      expect(result).to.be.undefined;
    });

    it("returns undefined when SSR is disabled", () => {
      const result = getAngular22SsrSecurityWarning({ ...baseOpts, ssr: false });
      expect(result).to.be.undefined;
    });

    it("returns undefined for Angular versions older than 22", () => {
      expect(getAngular22SsrSecurityWarning({ ...baseOpts, version: "20.3.10" })).to.be.undefined;
      expect(getAngular22SsrSecurityWarning({ ...baseOpts, version: "21.2.8" })).to.be.undefined;
    });

    it("flags both issues when nothing is configured for v22 SSR", () => {
      const result = getAngular22SsrSecurityWarning(baseOpts);
      expect(result).to.deep.equal({
        allowedHostsMissing: ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS,
        trustProxyHeadersMissing: true,
      });
    });

    it("supports prerelease versions like 22.0.0-next.12", () => {
      const result = getAngular22SsrSecurityWarning({ ...baseOpts, version: "22.0.0-next.12" });
      expect(result).to.deep.equal({
        allowedHostsMissing: ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS,
        trustProxyHeadersMissing: true,
      });
    });

    it("returns undefined when allowedHosts contains '*' and trustProxyHeaders is configured", () => {
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: ["*"],
        serverEntrySource: "new AngularNodeAppEngine({ trustProxyHeaders: true })",
      });
      expect(result).to.be.undefined;
    });

    it("returns undefined when all recommended hostnames are present and trustProxyHeaders is configured", () => {
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS],
        serverEntrySource: "trustProxyHeaders: ['x-forwarded-host']",
      });
      expect(result).to.be.undefined;
    });

    it("only flags trustProxyHeaders when hosts are configured but proxy headers are not", () => {
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS],
      });
      expect(result).to.deep.equal({
        allowedHostsMissing: [],
        trustProxyHeadersMissing: true,
      });
    });

    it("only flags allowedHosts when proxy headers are configured but hosts are partial", () => {
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: ["*.web.app"],
        serverEntrySource: "trustProxyHeaders: true",
      });
      expect(result).to.deep.equal({
        allowedHostsMissing: ["*.firebaseapp.com", "*.a.run.app"],
        trustProxyHeadersMissing: false,
      });
    });

    it("treats an allowedHosts assignment in the server entry as user-managed", () => {
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        serverEntrySource:
          "new CommonEngine({ allowedHosts: ['fb-tools-dev.web.app'] }); trustProxyHeaders: true",
      });
      expect(result).to.be.undefined;
    });
  });

  describe("formatAngular22SsrSecurityWarning", () => {
    it("includes the missing hostnames and the angular.json snippet", () => {
      const message = formatAngular22SsrSecurityWarning({
        allowedHostsMissing: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS],
        trustProxyHeadersMissing: false,
      });
      expect(message).to.include("Angular 22");
      expect(message).to.include('"*.web.app"');
      expect(message).to.include('"*.firebaseapp.com"');
      expect(message).to.include('"*.a.run.app"');
      expect(message).to.include("security.allowedHosts");
      expect(message).to.include(
        "https://angular.dev/best-practices/security#configuring-allowed-hosts",
      );
      expect(message).to.not.include("trustProxyHeaders");
    });

    it("includes the trustProxyHeaders snippet when that piece is missing", () => {
      const message = formatAngular22SsrSecurityWarning({
        allowedHostsMissing: [],
        trustProxyHeadersMissing: true,
      });
      expect(message).to.include("trustProxyHeaders");
      expect(message).to.include(
        "https://angular.dev/best-practices/security#configuring-trusted-proxy-headers",
      );
      expect(message).to.not.include("security.allowedHosts");
    });

    it("includes both sections when both pieces are missing", () => {
      const message = formatAngular22SsrSecurityWarning({
        allowedHostsMissing: ["*.a.run.app"],
        trustProxyHeadersMissing: true,
      });
      expect(message).to.include("security.allowedHosts");
      expect(message).to.include("trustProxyHeaders");
    });
  });

  describe("extractAngular22AllowedHostsFromBuildOptions", () => {
    it("returns undefined when options are missing", () => {
      expect(extractAngular22AllowedHostsFromBuildOptions(undefined)).to.be.undefined;
      expect(extractAngular22AllowedHostsFromBuildOptions(null)).to.be.undefined;
    });

    it("returns undefined when there is no security key", () => {
      expect(extractAngular22AllowedHostsFromBuildOptions({})).to.be.undefined;
    });

    it("returns undefined when security.allowedHosts is not an array", () => {
      expect(extractAngular22AllowedHostsFromBuildOptions({ security: { allowedHosts: "*" } })).to
        .be.undefined;
    });

    it("returns the configured hostnames when present", () => {
      expect(
        extractAngular22AllowedHostsFromBuildOptions({
          security: { allowedHosts: ["*.web.app", "*.firebaseapp.com"] },
        }),
      ).to.deep.equal(["*.web.app", "*.firebaseapp.com"]);
    });

    it("filters out non-string entries to keep downstream comparisons safe", () => {
      expect(
        extractAngular22AllowedHostsFromBuildOptions({
          security: { allowedHosts: ["*.web.app", 42, null, "*.a.run.app"] },
        }),
      ).to.deep.equal(["*.web.app", "*.a.run.app"]);
    });
  });

  describe("readAngular22ServerEntrySource", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "angular-server-entry-"));
      fs.mkdirSync(path.join(tmpDir, "src"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns undefined when no server entry file exists", async () => {
      expect(await readAngular22ServerEntrySource(tmpDir)).to.be.undefined;
    });

    it("reads src/server.ts when present", async () => {
      const contents = "import express from 'express';\nconst app = express();";
      fs.writeFileSync(path.join(tmpDir, "src", "server.ts"), contents);
      expect(await readAngular22ServerEntrySource(tmpDir)).to.equal(contents);
    });

    it("falls back to src/server.mjs when src/server.ts is missing", async () => {
      const contents = "export const x = 1;";
      fs.writeFileSync(path.join(tmpDir, "src", "server.mjs"), contents);
      expect(await readAngular22ServerEntrySource(tmpDir)).to.equal(contents);
    });

    it("falls back to src/server.js when neither .ts nor .mjs exist", async () => {
      const contents = "module.exports = {};";
      fs.writeFileSync(path.join(tmpDir, "src", "server.js"), contents);
      expect(await readAngular22ServerEntrySource(tmpDir)).to.equal(contents);
    });

    it("prefers src/server.ts over the .mjs and .js fallbacks", async () => {
      fs.writeFileSync(path.join(tmpDir, "src", "server.ts"), "// ts");
      fs.writeFileSync(path.join(tmpDir, "src", "server.mjs"), "// mjs");
      fs.writeFileSync(path.join(tmpDir, "src", "server.js"), "// js");
      expect(await readAngular22ServerEntrySource(tmpDir)).to.equal("// ts");
    });
  });

  describe("maybeWarnAngular22SsrSecurity", () => {
    let sandbox: sinon.SinonSandbox;
    let findDependencyStub: sinon.SinonStub;
    let logWarning: sinon.SinonSpy;
    let readBuildOptionsAllowedHosts: sinon.SinonStub;
    let readServerEntrySource: sinon.SinonStub;

    const stubAngularVersion = (version: string | undefined): void => {
      findDependencyStub.callsFake((name: string) => {
        if (name === "@angular/core" && version) {
          return { version, resolved: "", overridden: false };
        }
        return undefined;
      });
    };

    const buildIO = (): Angular22SsrSecurityIO => ({
      readBuildOptionsAllowedHosts,
      readServerEntrySource,
      logWarning,
    });

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      findDependencyStub = sandbox.stub(frameworkUtils, "findDependency");
      logWarning = sinon.spy();
      readBuildOptionsAllowedHosts = sandbox.stub().resolves(undefined);
      readServerEntrySource = sandbox.stub().resolves(undefined);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("does not warn when SSR is disabled", async () => {
      stubAngularVersion("22.0.0");
      await maybeWarnAngular22SsrSecurity("/some/dir", "production", false, buildIO());
      expect(logWarning.called).to.be.false;
      expect(readBuildOptionsAllowedHosts.called).to.be.false;
      expect(readServerEntrySource.called).to.be.false;
    });

    it("does not warn when no Angular version can be detected", async () => {
      stubAngularVersion(undefined);
      await maybeWarnAngular22SsrSecurity("/some/dir", "production", true, buildIO());
      expect(logWarning.called).to.be.false;
      expect(readBuildOptionsAllowedHosts.called).to.be.false;
      expect(readServerEntrySource.called).to.be.false;
    });

    it("does not warn for Angular versions older than 22 with SSR enabled", async () => {
      stubAngularVersion("21.2.0");
      await maybeWarnAngular22SsrSecurity("/some/dir", "production", true, buildIO());
      expect(logWarning.called).to.be.false;
    });

    it("warns under the 'angular' label when v22 SSR has no security configuration", async () => {
      stubAngularVersion("22.0.0");
      await maybeWarnAngular22SsrSecurity("/some/dir", "production", true, buildIO());

      expect(readBuildOptionsAllowedHosts.calledOnceWith("/some/dir", "production")).to.be.true;
      expect(readServerEntrySource.calledOnceWith("/some/dir")).to.be.true;
      expect(logWarning.calledOnce).to.be.true;
      const message = logWarning.firstCall.args[0] as string;
      expect(message).to.include("security.allowedHosts");
      expect(message).to.include("trustProxyHeaders");
    });

    it("does not warn when allowedHosts and trustProxyHeaders are fully configured", async () => {
      stubAngularVersion("22.0.0");
      readBuildOptionsAllowedHosts.resolves([...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS]);
      readServerEntrySource.resolves("trustProxyHeaders: ['x-forwarded-host']");

      await maybeWarnAngular22SsrSecurity("/some/dir", "production", true, buildIO());
      expect(logWarning.called).to.be.false;
    });

    it("only warns about trustProxyHeaders when allowedHosts is satisfied", async () => {
      stubAngularVersion("22.0.0");
      readBuildOptionsAllowedHosts.resolves([...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS]);
      readServerEntrySource.resolves(undefined);

      await maybeWarnAngular22SsrSecurity("/some/dir", "production", true, buildIO());
      expect(logWarning.calledOnce).to.be.true;
      const message = logWarning.firstCall.args[0] as string;
      expect(message).to.include("trustProxyHeaders");
      expect(message).to.not.include("security.allowedHosts");
    });

    it("swallows reader failures so the build is never blocked", async () => {
      stubAngularVersion("22.0.0");
      readBuildOptionsAllowedHosts.rejects(new Error("workspace blew up"));
      await maybeWarnAngular22SsrSecurity("/some/dir", "production", true, buildIO());
      expect(logWarning.called).to.be.false;
    });
  });
});
