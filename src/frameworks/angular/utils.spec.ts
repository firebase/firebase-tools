import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { JsonObject } from "@angular-devkit/core";
import { expect } from "chai";
import * as sinon from "sinon";

import {
  getBuilderType,
  BuilderType,
  getAngular22SsrSecurityWarning,
  formatAngular22SsrSecurityWarning,
  ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS,
  extractAngular22AllowedHostsFromBuildOptions,
  getAngular22ServerEntryPath,
  maybeWarnAngular22SsrSecurity,
} from "./utils";
import * as frameworkUtils from "../utils";
import * as cliUtils from "../../utils";

describe("Angular utils", () => {
  // The unmodified src/server.ts emitted by `ng add @angular/ssr` for the
  // @angular/build:application builder (no SSRF configuration). Kept faithful
  // so the detection regexes are exercised against real Angular v22 code.
  // Source: angular-cli packages/schematics/angular/ssr/files/application-builder/server.ts.template
  const SERVER_TS_DEFAULT = [
    "import {",
    "  AngularNodeAppEngine,",
    "  createNodeRequestHandler,",
    "  isMainModule,",
    "  writeResponseToNodeResponse,",
    "} from '@angular/ssr/node';",
    "import express from 'express';",
    "import { join } from 'node:path';",
    "",
    "const browserDistFolder = join(import.meta.dirname, '../browser');",
    "",
    "const app = express();",
    "const angularApp = new AngularNodeAppEngine();",
    "",
    "app.use(",
    "  express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }),",
    ");",
    "",
    "app.use((req, res, next) => {",
    "  angularApp",
    "    .handle(req)",
    "    .then((response) =>",
    "      response ? writeResponseToNodeResponse(response, res) : next(),",
    "    )",
    "    .catch(next);",
    "});",
    "",
    "export const reqHandler = createNodeRequestHandler(app);",
    "",
  ].join("\n");

  // Realistic configured server.ts: the security doc shows allowedHosts /
  // trustProxyHeaders being passed to the engine constructor as an options
  // object (multi-line, as a developer would actually write it).
  // Source: angular/angular adev/src/content/guide/security.md
  const serverTsWithEngineOptions = (...optionLines: string[]): string =>
    SERVER_TS_DEFAULT.replace(
      "const angularApp = new AngularNodeAppEngine();",
      ["const angularApp = new AngularNodeAppEngine({", ...optionLines, "});"].join("\n"),
    );

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
      ssr: true,
      buildOptionsAllowedHosts: undefined as string[] | undefined,
      serverEntrySource: undefined as string | undefined,
    };

    it("returns undefined when SSR is disabled", () => {
      const result = getAngular22SsrSecurityWarning({ ...baseOpts, ssr: false });
      expect(result).to.be.undefined;
    });

    it("flags the missing hosts when nothing is configured for v22 SSR", () => {
      const result = getAngular22SsrSecurityWarning(baseOpts);
      expect(result).to.deep.equal({
        allowedHostsMissing: ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS,
        trustProxyHeadersEnabled: false,
      });
    });

    it("returns undefined when allowedHosts contains '*' even without trustProxyHeaders", () => {
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: ["*"],
        serverEntrySource: SERVER_TS_DEFAULT,
      });
      expect(result).to.be.undefined;
    });

    it("returns undefined when allowedHosts contains '*' and trustProxyHeaders is configured", () => {
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: ["*"],
        serverEntrySource: serverTsWithEngineOptions("  trustProxyHeaders: true,"),
      });
      expect(result).to.be.undefined;
    });

    it("returns undefined when all recommended hostnames are present and trustProxyHeaders is configured", () => {
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS],
        serverEntrySource: serverTsWithEngineOptions(
          "  trustProxyHeaders: ['x-forwarded-host', 'x-forwarded-proto'],",
        ),
      });
      expect(result).to.be.undefined;
    });

    it("returns undefined when every host is allowlisted even though the default server.ts leaves trustProxyHeaders unset", () => {
      // Allowlist covers the Cloud Run host the engine validates; trustProxyHeaders not required.
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS],
        // The unmodified schematic server.ts constructs the engine with no options.
        serverEntrySource: SERVER_TS_DEFAULT,
      });
      expect(result).to.be.undefined;
    });

    it("flags the remaining hosts when proxy headers are on but the allowlist is partial", () => {
      // Proxied mode validates the public domain; *.firebaseapp.com still missing.
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: ["*.web.app"],
        serverEntrySource: serverTsWithEngineOptions("  trustProxyHeaders: true,"),
      });
      expect(result).to.deep.equal({
        allowedHostsMissing: ["*.firebaseapp.com", "*.a.run.app"],
        trustProxyHeadersEnabled: true,
      });
    });

    it("treats engine-level allowedHosts in the server entry as user-managed", () => {
      // Per the Angular security guide, allowedHosts can be configured on the
      // AngularNodeAppEngine instead of angular.json.
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        serverEntrySource: serverTsWithEngineOptions(
          "  allowedHosts: ['fb-tools-dev.web.app', '*.web.app'],",
          "  trustProxyHeaders: true,",
        ),
      });
      expect(result).to.be.undefined;
    });

    it("detects engine-level config on the non-Node AngularAppEngine variant", () => {
      // The security guide documents the same options on AngularAppEngine.
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        serverEntrySource: [
          "import { AngularAppEngine } from '@angular/ssr';",
          "",
          "const angularApp = new AngularAppEngine({",
          "  allowedHosts: ['fb-tools-dev.web.app'],",
          "  trustProxyHeaders: ['x-forwarded-host'],",
          "});",
        ].join("\n"),
      });
      expect(result).to.be.undefined;
    });

    it("does not treat allowedHosts mentioned only in a comment as configured", () => {
      // Comment mention (no assignment) must not suppress; proxied mode, no public host allowlisted.
      const serverEntrySource = serverTsWithEngineOptions(
        "  // TODO: pass allowedHosts to AngularNodeAppEngine before deploying",
        "  trustProxyHeaders: true,",
      );
      const result = getAngular22SsrSecurityWarning({ ...baseOpts, serverEntrySource });
      expect(result).to.deep.equal({
        allowedHostsMissing: ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS,
        trustProxyHeadersEnabled: true,
      });
    });

    it("recognizes a multi-line trustProxyHeaders option as configured", () => {
      // The security guide writes the option object across multiple lines;
      // the regex must still match `trustProxyHeaders` followed by `:`.
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS],
        serverEntrySource: serverTsWithEngineOptions("  trustProxyHeaders: true,"),
      });
      expect(result).to.be.undefined;
    });

    it("does not treat trustProxyHeaders mentioned only in a comment as enabled", () => {
      // Comment mention must not flip to proxied mode; default mode still needs the Cloud Run host.
      const serverEntrySource = SERVER_TS_DEFAULT.replace(
        "const app = express();",
        "// remember to set trustProxyHeaders before deploy\nconst app = express();",
      );
      const result = getAngular22SsrSecurityWarning({
        ...baseOpts,
        buildOptionsAllowedHosts: ["*.web.app", "*.firebaseapp.com"],
        serverEntrySource,
      });
      expect(result).to.deep.equal({
        allowedHostsMissing: ["*.a.run.app"],
        trustProxyHeadersEnabled: false,
      });
    });
  });

  describe("formatAngular22SsrSecurityWarning", () => {
    it("includes the missing hostnames and the angular.json snippet", () => {
      // trustProxyHeaders already enabled -> the alternative hint is redundant.
      const message = formatAngular22SsrSecurityWarning({
        allowedHostsMissing: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS],
        trustProxyHeadersEnabled: true,
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

    it("adds the trustProxyHeaders alternative when it is not already enabled", () => {
      const message = formatAngular22SsrSecurityWarning({
        allowedHostsMissing: ["*.a.run.app"],
        trustProxyHeadersEnabled: false,
      });
      expect(message).to.include("security.allowedHosts");
      expect(message).to.include('"*.a.run.app"');
      expect(message).to.include("trustProxyHeaders");
      expect(message).to.include(
        "https://angular.dev/best-practices/security#configuring-trusted-proxy-headers",
      );
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

  describe("getAngular22ServerEntryPath", () => {
    it("falls back to the conventional src/server.ts when options are missing", () => {
      expect(getAngular22ServerEntryPath(undefined)).to.equal("src/server.ts");
      expect(getAngular22ServerEntryPath(null)).to.equal("src/server.ts");
    });

    it("falls back to src/server.ts when there is no ssr option", () => {
      expect(getAngular22ServerEntryPath({})).to.equal("src/server.ts");
    });

    it("falls back to src/server.ts for the boolean ssr form (entry is optional in v22)", () => {
      // ssr: true is real SSR, not SSG; ssr.entry is optional, so the
      // conventional schematic-generated src/server.ts is still inspected.
      expect(getAngular22ServerEntryPath({ ssr: true })).to.equal("src/server.ts");
      expect(getAngular22ServerEntryPath({ ssr: false })).to.equal("src/server.ts");
    });

    it("falls back to src/server.ts when ssr is an object without a string entry", () => {
      expect(getAngular22ServerEntryPath({ ssr: {} })).to.equal("src/server.ts");
      expect(getAngular22ServerEntryPath({ ssr: { entry: 42 } })).to.equal("src/server.ts");
    });

    it("prefers the explicit ssr.entry path, including custom layouts", () => {
      expect(getAngular22ServerEntryPath({ ssr: { entry: "src/server.ts" } })).to.equal(
        "src/server.ts",
      );
      expect(
        getAngular22ServerEntryPath({ ssr: { entry: "projects/foo/src/entry-server.ts" } }),
      ).to.equal("projects/foo/src/entry-server.ts");
    });
  });

  describe("angular.json resolved build options scenarios", () => {
    // A minimal-but-realistic angular.json for the @angular/build:application
    // builder. Only the keys relevant to the SSRF check vary per scenario.
    // Shape mirrors angular/angular adev/.../guide/security.md.
    type BuildOptions = Record<string, unknown>;
    const angularJson = (
      options: BuildOptions,
      configurations: Record<string, BuildOptions> = {},
    ): JsonObject =>
      ({
        version: 1,
        projects: {
          app: {
            projectType: "application",
            root: "",
            sourceRoot: "src",
            architect: {
              build: {
                builder: "@angular/build:application",
                options: { outputPath: "dist/app", browser: "src/main.ts", ...options },
                configurations,
                defaultConfiguration: "production",
              },
            },
          },
        },
      }) as unknown as JsonObject;

    // Mirrors what architectHost.getOptionsForTarget(buildTarget) returns in
    // getContext: the base options merged with the selected configuration.
    const resolveBuildOptions = (json: JsonObject, configuration?: string): JsonObject => {
      const build = (json as any).projects.app.architect.build;
      return {
        ...build.options,
        ...(configuration ? build.configurations?.[configuration] ?? {} : {}),
      } as JsonObject;
    };

    const warnFor = (json: JsonObject, serverEntrySource: string, configuration?: string) => {
      const options = resolveBuildOptions(json, configuration);
      return getAngular22SsrSecurityWarning({
        ssr: !!options.ssr,
        buildOptionsAllowedHosts: extractAngular22AllowedHostsFromBuildOptions(options),
        serverEntrySource,
      });
    };

    it("non-SSR project (no ssr option) is never flagged", () => {
      const json = angularJson({ outputMode: "static" });
      expect(warnFor(json, SERVER_TS_DEFAULT)).to.be.undefined;
    });

    it("SSR via ssr.entry with no security config flags the missing hosts", () => {
      const json = angularJson({ outputMode: "server", ssr: { entry: "src/server.ts" } });
      expect(warnFor(json, SERVER_TS_DEFAULT)).to.deep.equal({
        allowedHostsMissing: ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS,
        trustProxyHeadersEnabled: false,
      });
    });

    it("SSR with the recommended security.allowedHosts is not flagged (Cloud Run host covered)", () => {
      const json = angularJson({
        outputMode: "server",
        ssr: { entry: "src/server.ts" },
        security: { allowedHosts: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS] },
      });
      // allowlist covers *.a.run.app (the validated host), so no warning despite trustProxyHeaders unset.
      expect(warnFor(json, SERVER_TS_DEFAULT)).to.be.undefined;
    });

    it("SSR fully configured (security.allowedHosts + engine trustProxyHeaders) is not flagged", () => {
      const json = angularJson({
        outputMode: "server",
        ssr: { entry: "src/server.ts" },
        security: { allowedHosts: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS] },
      });
      const serverTs = serverTsWithEngineOptions("  trustProxyHeaders: true,");
      expect(warnFor(json, serverTs)).to.be.undefined;
    });

    it("security.allowedHosts ['*'] plus engine trustProxyHeaders is not flagged", () => {
      const json = angularJson({
        outputMode: "server",
        ssr: { entry: "src/server.ts" },
        security: { allowedHosts: ["*"] },
      });
      const serverTs = serverTsWithEngineOptions("  trustProxyHeaders: true,");
      expect(warnFor(json, serverTs)).to.be.undefined;
    });

    it("resolves security.allowedHosts contributed by the selected configuration", () => {
      // Realistic: base options have no security; the production configuration
      // adds it. getOptionsForTarget merges configuration over options.
      const json = angularJson(
        { outputMode: "server", ssr: { entry: "src/server.ts" } },
        { production: { security: { allowedHosts: [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS] } } },
      );
      // Without the configuration the hosts are missing...
      expect(warnFor(json, SERVER_TS_DEFAULT)).to.deep.equal({
        allowedHostsMissing: ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS,
        trustProxyHeadersEnabled: false,
      });
      // ...but resolving the production configuration satisfies allowedHosts
      // (the Cloud Run host is covered), so the warning clears.
      expect(warnFor(json, SERVER_TS_DEFAULT, "production")).to.be.undefined;
    });
  });

  describe("maybeWarnAngular22SsrSecurity", () => {
    let sandbox: sinon.SinonSandbox;
    let findDependencyStub: sinon.SinonStub;
    let logLabeledWarningStub: sinon.SinonStub;
    let tmpDir: string;

    const RECOMMENDED = [...ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS];

    const stubAngularVersion = (version: string | undefined): void => {
      findDependencyStub.callsFake((name: string) => {
        if (name === "@angular/core" && version) {
          return { version, resolved: "", overridden: false };
        }
        return undefined;
      });
    };

    const writeServerEntry = (relPath: string, contents: string): void => {
      const full = path.join(tmpDir, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, contents);
    };

    // The warning message is logged as logLabeledWarning("Angular 22", message).
    const warningMessage = (): string => logLabeledWarningStub.firstCall.args[1] as string;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      findDependencyStub = sandbox.stub(frameworkUtils, "findDependency");
      logLabeledWarningStub = sandbox.stub(cliUtils, "logLabeledWarning");
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "angular-ssr-security-"));
    });

    afterEach(() => {
      sandbox.restore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("does not warn when SSR is disabled", async () => {
      stubAngularVersion("22.0.0");
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: false,
        buildTargetOptions: undefined,
      });
      expect(logLabeledWarningStub.called).to.be.false;
    });

    it("does not warn when no Angular version can be detected", async () => {
      stubAngularVersion(undefined);
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: undefined,
      });
      expect(logLabeledWarningStub.called).to.be.false;
    });

    it("does not warn for Angular versions older than 22 with SSR enabled", async () => {
      stubAngularVersion("21.2.0");
      writeServerEntry("src/server.ts", SERVER_TS_DEFAULT);
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: { ssr: { entry: "src/server.ts" } },
      });
      expect(logLabeledWarningStub.called).to.be.false;
    });

    it("warns when using a prerelease Angular 22 version like 22.0.0-next.12", async () => {
      stubAngularVersion("22.0.0-next.12");
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: { ssr: true },
      });
      expect(logLabeledWarningStub.calledOnce).to.be.true;
    });

    it("warns under the 'Angular 22' label when v22 SSR has no security configuration", async () => {
      stubAngularVersion("22.0.0");
      // No src/server.ts on disk and no security.allowedHosts in options.
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: { ssr: true },
      });

      expect(logLabeledWarningStub.calledOnce).to.be.true;
      expect(logLabeledWarningStub.firstCall.args[0]).to.equal("Angular 22");
      const message = warningMessage();
      expect(message).to.include("security.allowedHosts");
      expect(message).to.include("trustProxyHeaders");
    });

    it("inspects the conventional src/server.ts when ssr:true keeps trustProxyHeaders there", async () => {
      // Regression for the hybrid fallback: a project using the boolean
      // ssr:true form with a hand-maintained src/server.ts must not be
      // falsely flagged for trustProxyHeaders.
      stubAngularVersion("22.0.0");
      writeServerEntry("src/server.ts", serverTsWithEngineOptions("  trustProxyHeaders: true,"));
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: { ssr: true, security: { allowedHosts: RECOMMENDED } },
      });
      expect(logLabeledWarningStub.called).to.be.false;
    });

    it("reads the server entry resolved from buildTargetOptions.ssr.entry", async () => {
      stubAngularVersion("22.0.0");
      writeServerEntry(
        "projects/foo/src/entry-server.ts",
        serverTsWithEngineOptions("  trustProxyHeaders: true,"),
      );
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: {
          ssr: { entry: "projects/foo/src/entry-server.ts" },
          security: { allowedHosts: RECOMMENDED },
        },
      });
      // The custom entry was read (its trustProxyHeaders satisfied the check),
      // proving we use options.ssr.entry rather than guessing src/server.ts.
      expect(logLabeledWarningStub.called).to.be.false;
    });

    it("sources allowedHosts from buildTargetOptions.security.allowedHosts", async () => {
      stubAngularVersion("22.0.0");
      writeServerEntry("src/server.ts", serverTsWithEngineOptions("  trustProxyHeaders: true,"));
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: {
          ssr: { entry: "src/server.ts" },
          security: { allowedHosts: ["*.web.app"] },
        },
      });

      expect(logLabeledWarningStub.calledOnce).to.be.true;
      const message = warningMessage();
      expect(message).to.include("security.allowedHosts");
      expect(message).to.include('"*.firebaseapp.com"');
      expect(message).to.not.include("trustProxyHeaders");
    });

    it("does not warn when allowedHosts and trustProxyHeaders are fully configured", async () => {
      stubAngularVersion("22.0.0");
      writeServerEntry(
        "src/server.ts",
        serverTsWithEngineOptions(
          "  trustProxyHeaders: ['x-forwarded-host', 'x-forwarded-proto'],",
        ),
      );
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: {
          ssr: { entry: "src/server.ts" },
          security: { allowedHosts: RECOMMENDED },
        },
      });
      expect(logLabeledWarningStub.called).to.be.false;
    });

    it("does not warn when the allowlist covers the Cloud Run host even though trustProxyHeaders is unset", async () => {
      stubAngularVersion("22.0.0");
      // No server entry => direct mode; recommended allowlist covers the Cloud Run host.
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: { ssr: true, security: { allowedHosts: RECOMMENDED } },
      });
      expect(logLabeledWarningStub.called).to.be.false;
    });

    it("swallows unexpected failures so the build is never blocked", async () => {
      // findDependency throwing simulates an unexpected internal failure; the
      // pre-flight must never propagate it.
      findDependencyStub.throws(new Error("dependency resolution blew up"));
      await maybeWarnAngular22SsrSecurity(tmpDir, {
        ssr: true,
        buildTargetOptions: { ssr: { entry: "src/server.ts" } },
      });
      expect(logLabeledWarningStub.called).to.be.false;
    });
  });
});
