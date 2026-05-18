import type { JsonObject } from "@angular-devkit/core";
import type { Target } from "@angular-devkit/architect";
import type { ProjectDefinition } from "@angular-devkit/core/src/workspace";
import type { WorkspaceNodeModulesArchitectHost } from "@angular-devkit/architect/node";

import { AngularI18nConfig } from "./interfaces";
import { findDependency, relativeRequire, validateLocales } from "../utils";
import { FirebaseError } from "../../error";
import { join, posix, sep } from "path";
import { readFile } from "fs/promises";
import { BUILD_TARGET_PURPOSE } from "../interfaces";
import { AssertionError } from "assert";
import { assertIsString, logLabeledWarning } from "../../utils";
import { coerce } from "semver";
import * as clc from "colorette";

async function localesForTarget(
  dir: string,
  architectHost: WorkspaceNodeModulesArchitectHost,
  target: Target,
  workspaceProject: ProjectDefinition,
) {
  const { targetStringFromTarget } = await relativeRequire(dir, "@angular-devkit/architect");
  const targetOptions = await architectHost.getOptionsForTarget(target);
  if (!targetOptions) {
    const targetString = targetStringFromTarget(target);
    throw new FirebaseError(`Couldn't find options for ${targetString}.`);
  }

  let locales: string[] | undefined = undefined;
  let defaultLocale: string | undefined = undefined;
  if (targetOptions.localize) {
    const i18n: AngularI18nConfig | undefined = workspaceProject.extensions?.i18n as any;
    if (!i18n) throw new FirebaseError(`No i18n config on project.`);
    if (typeof i18n.sourceLocale === "string") {
      throw new FirebaseError(`All your i18n locales must have a baseHref of "" on Firebase, use an object for sourceLocale in your angular.json:
  "i18n": {
    "sourceLocale": {
      "code": "${i18n.sourceLocale}",
      "baseHref": ""
    },
    ...
  }`);
    }
    if (i18n.sourceLocale.baseHref !== "")
      throw new FirebaseError(
        'All your i18n locales must have a baseHref of "" on Firebase, errored on sourceLocale.',
      );
    defaultLocale = i18n.sourceLocale.code;
    if (targetOptions.localize === true) {
      locales = [defaultLocale];
      for (const [locale, { baseHref }] of Object.entries(i18n.locales)) {
        if (baseHref !== "")
          throw new FirebaseError(
            `All your i18n locales must have a baseHref of \"\" on Firebase, errored on ${locale}.`,
          );
        locales.push(locale);
      }
    } else if (Array.isArray(targetOptions.localize)) {
      locales = [defaultLocale];
      for (const locale of targetOptions.localize) {
        if (typeof locale !== "string") continue;
        locales.push(locale);
      }
    }
  }
  validateLocales(locales);
  return { locales, defaultLocale };
}

export enum BuilderType {
  DEPLOY = "deploy",
  DEV_SERVER = "dev-server",
  SSR_DEV_SERVER = "ssr-dev-server",
  SERVER = "server",
  BROWSER = "browser",
  BROWSER_ESBUILD = "browser-esbuild",
  APPLICATION = "application",
  PRERENDER = "prerender",
}

const DEV_SERVER_TARGETS: BuilderType[] = [BuilderType.DEV_SERVER, BuilderType.SSR_DEV_SERVER];

function getValidBuilderTypes(purpose: BUILD_TARGET_PURPOSE): BuilderType[] {
  return [
    BuilderType.APPLICATION,
    BuilderType.BROWSER_ESBUILD,
    BuilderType.DEPLOY,
    BuilderType.BROWSER,
    BuilderType.PRERENDER,
    ...(purpose === "deploy" ? [] : DEV_SERVER_TARGETS),
  ];
}

export async function getAllTargets(purpose: BUILD_TARGET_PURPOSE, dir: string) {
  const validBuilderTypes = getValidBuilderTypes(purpose);
  const [{ NodeJsAsyncHost }, { workspaces }, { targetStringFromTarget }] = await Promise.all([
    relativeRequire(dir, "@angular-devkit/core/node"),
    relativeRequire(dir, "@angular-devkit/core"),
    relativeRequire(dir, "@angular-devkit/architect"),
  ]);
  const host = workspaces.createWorkspaceHost(new NodeJsAsyncHost());
  const { workspace } = await workspaces.readWorkspace(dir, host);

  const targets: string[] = [];
  workspace.projects.forEach((projectDefinition, project) => {
    if (projectDefinition.extensions.projectType !== "application") return;
    projectDefinition.targets.forEach((targetDefinition, target) => {
      const builderType = getBuilderType(targetDefinition.builder);
      if (builderType && !validBuilderTypes.includes(builderType)) {
        return;
      }
      const configurations = Object.keys(targetDefinition.configurations || {});
      if (!configurations.includes("production")) configurations.push("production");
      if (!configurations.includes("development")) configurations.push("development");
      configurations.forEach((configuration) => {
        targets.push(targetStringFromTarget({ project, target, configuration }));
      });
    });
  });
  return targets;
}

// TODO(jamesdaniels) memoize, dry up
export async function getContext(dir: string, targetOrConfiguration?: string) {
  const [
    { NodeJsAsyncHost },
    { workspaces },
    { WorkspaceNodeModulesArchitectHost },
    { Architect, targetFromTargetString, targetStringFromTarget },
    { parse },
  ] = await Promise.all([
    relativeRequire(dir, "@angular-devkit/core/node"),
    relativeRequire(dir, "@angular-devkit/core"),
    relativeRequire(dir, "@angular-devkit/architect/node"),
    relativeRequire(dir, "@angular-devkit/architect"),
    relativeRequire(dir, "jsonc-parser"),
  ]);

  const host = workspaces.createWorkspaceHost(new NodeJsAsyncHost());
  const { workspace } = await workspaces.readWorkspace(dir, host);
  const architectHost = new WorkspaceNodeModulesArchitectHost(workspace, dir);
  const architect = new Architect(architectHost);

  let overrideTarget: Target | undefined;
  let deployTarget: Target | undefined;
  let project: string | undefined;
  let buildTarget: Target | undefined;
  let browserTarget: Target | undefined;
  let serverTarget: Target | undefined;
  let prerenderTarget: Target | undefined;
  let serveTarget: Target | undefined;
  let serveOptimizedImages = false;

  let configuration: string | undefined = undefined;
  if (targetOrConfiguration) {
    try {
      overrideTarget = targetFromTargetString(targetOrConfiguration);
      configuration = overrideTarget.configuration;
      project = overrideTarget.project;
    } catch (e) {
      configuration = targetOrConfiguration;
    }
  }

  if (!project) {
    const angularJson = parse(await host.readFile(join(dir, "angular.json")));
    project = angularJson.defaultProject;
  }

  if (!project) {
    const apps: string[] = [];
    workspace.projects.forEach((value, key) => {
      if (value.extensions.projectType === "application") apps.push(key);
    });
    if (apps.length === 1) project = apps[0];
  }

  if (!project) {
    throwCannotDetermineTarget();
  }

  const workspaceProject = workspace.projects.get(project);
  if (!workspaceProject) throw new FirebaseError(`No project ${project} found.`);

  if (overrideTarget) {
    const target = workspaceProject.targets.get(overrideTarget.target)!;
    const builderType = getBuilderType(target.builder);
    switch (builderType) {
      case BuilderType.DEPLOY:
        deployTarget = overrideTarget;
        break;
      case BuilderType.APPLICATION:
        buildTarget = overrideTarget;
        break;
      case BuilderType.BROWSER:
      case BuilderType.BROWSER_ESBUILD:
        browserTarget = overrideTarget;
        break;
      case BuilderType.PRERENDER:
        prerenderTarget = overrideTarget;
        break;
      case BuilderType.DEV_SERVER:
      case BuilderType.SSR_DEV_SERVER:
        serveTarget = overrideTarget;
        break;
      default:
        throw new FirebaseError(`builder type ${builderType} not known.`);
    }
  } else if (workspaceProject.targets.has("deploy")) {
    const { builder, defaultConfiguration = "production" } =
      workspaceProject.targets.get("deploy")!;
    if (getBuilderType(builder) === BuilderType.DEPLOY) {
      deployTarget = {
        project,
        target: "deploy",
        configuration: configuration || defaultConfiguration,
      };
    }
  }

  if (deployTarget) {
    const options = await architectHost
      .getOptionsForTarget(deployTarget)
      .catch(() => workspaceProject.targets.get(deployTarget!.target)?.options);
    if (!options) throw new FirebaseError("Unable to get options for ng-deploy.");
    if (options.buildTarget) {
      assertIsString(options.buildTarget);
      buildTarget = targetFromTargetString(options.buildTarget);
    }
    if (options.prerenderTarget) {
      assertIsString(options.prerenderTarget);
      prerenderTarget = targetFromTargetString(options.prerenderTarget);
    }
    if (options.browserTarget) {
      assertIsString(options.browserTarget);
      browserTarget = targetFromTargetString(options.browserTarget);
    }
    if (options.serverTarget) {
      assertIsString(options.serverTarget);
      serverTarget = targetFromTargetString(options.serverTarget);
    }
    if (options.serveTarget) {
      assertIsString(options.serveTarget);
      serveTarget = targetFromTargetString(options.serveTarget);
    }
    if (options.serveOptimizedImages) {
      serveOptimizedImages = true;
    }
    if (prerenderTarget) {
      const prerenderOptions = await architectHost.getOptionsForTarget(prerenderTarget);
      if (!browserTarget) {
        throw new FirebaseError("ng-deploy with prerenderTarget requires a browserTarget");
      }
      if (targetStringFromTarget(browserTarget) !== prerenderOptions?.browserTarget) {
        throw new FirebaseError(
          "ng-deploy's browserTarget and prerender's browserTarget do not match. Please check your angular.json",
        );
      }
      if (serverTarget && targetStringFromTarget(serverTarget) !== prerenderOptions?.serverTarget) {
        throw new FirebaseError(
          "ng-deploy's serverTarget and prerender's serverTarget do not match. Please check your angular.json",
        );
      }
      if (!serverTarget) {
        console.warn(
          "Treating the application as fully rendered. Add a serverTarget to your deploy target in angular.json to utilize server-side rendering.",
        );
      }
    }
    if (!buildTarget && !browserTarget) {
      throw new FirebaseError(
        "ng-deploy is missing a build target. Plase check your angular.json.",
      );
    }
  } else if (!overrideTarget) {
    if (workspaceProject.targets.has("prerender")) {
      const { defaultConfiguration = "production" } = workspaceProject.targets.get("prerender")!;
      prerenderTarget = {
        project,
        target: "prerender",
        configuration: configuration || defaultConfiguration,
      };
      const options = await architectHost.getOptionsForTarget(prerenderTarget);
      assertIsString(options?.browserTarget);
      browserTarget = targetFromTargetString(options.browserTarget);
      assertIsString(options?.serverTarget);
      serverTarget = targetFromTargetString(options.serverTarget);
    }
    if (!buildTarget && !browserTarget && workspaceProject.targets.has("build")) {
      const { builder, defaultConfiguration = "production" } =
        workspaceProject.targets.get("build")!;
      const builderType = getBuilderType(builder);
      const target = {
        project,
        target: "build",
        configuration: configuration || defaultConfiguration,
      };
      if (builderType === BuilderType.BROWSER || builderType === BuilderType.BROWSER_ESBUILD) {
        browserTarget = target;
      } else {
        buildTarget = target;
      }
    }
    if (!serverTarget && workspaceProject.targets.has("server")) {
      const { defaultConfiguration = "production" } = workspaceProject.targets.get("server")!;
      serverTarget = {
        project,
        target: "server",
        configuration: configuration || defaultConfiguration,
      };
    }
  }

  if (!serveTarget) {
    if (serverTarget && workspaceProject.targets.has("serve-ssr")) {
      const { defaultConfiguration = "development" } = workspaceProject.targets.get("serve-ssr")!;
      serveTarget = {
        project,
        target: "serve-ssr",
        configuration: configuration || defaultConfiguration,
      };
    } else if (workspaceProject.targets.has("serve")) {
      const { defaultConfiguration = "development" } = workspaceProject.targets.get("serve")!;
      serveTarget = {
        project,
        target: "serve",
        configuration: configuration || defaultConfiguration,
      };
    }
  }

  for (const target of [
    deployTarget,
    buildTarget,
    prerenderTarget,
    serverTarget,
    browserTarget,
    serveTarget,
  ]) {
    if (target) {
      const targetString = targetStringFromTarget(target);
      if (target.project !== project)
        throw new FirebaseError(
          `${targetString} is not in project ${project}. Please check your angular.json`,
        );
      const definition = workspaceProject.targets.get(target.target);
      if (!definition) throw new FirebaseError(`${target} could not be found in your angular.json`);
      const { builder } = definition;
      const builderType = getBuilderType(builder);
      if (target === deployTarget && builderType === BuilderType.DEPLOY) continue;
      if (target === buildTarget && builderType === BuilderType.APPLICATION) continue;
      if (target === buildTarget && builderType === BuilderType.BROWSER) continue;
      if (target === browserTarget && builderType === BuilderType.BROWSER_ESBUILD) continue;
      if (target === browserTarget && builderType === BuilderType.BROWSER) continue;
      if (target === browserTarget && builderType === BuilderType.APPLICATION) continue;
      if (target === prerenderTarget && builderType === BuilderType.PRERENDER) continue;
      if (target === prerenderTarget && builderType === BuilderType.PRERENDER) continue;
      if (target === serverTarget && builderType === BuilderType.SERVER) continue;
      if (target === serveTarget && builderType === BuilderType.SSR_DEV_SERVER) continue;
      if (target === serveTarget && builderType === BuilderType.DEV_SERVER) continue;
      if (target === serveTarget && builderType === BuilderType.SERVER) continue;
      throw new FirebaseError(
        `${definition.builder} (${targetString}) is not a recognized builder. Please check your angular.json`,
      );
    }
  }

  const buildOrBrowserTarget = buildTarget || browserTarget;
  if (!buildOrBrowserTarget) {
    throw new FirebaseError(`No build target on ${project}`);
  }

  const browserTargetOptions = await tryToGetOptionsForTarget(architectHost, buildOrBrowserTarget);
  if (!browserTargetOptions) {
    const targetString = targetStringFromTarget(buildOrBrowserTarget);
    throw new FirebaseError(`Couldn't find options for ${targetString}.`);
  }

  const baseHref = browserTargetOptions.baseHref || "/";
  assertIsString(baseHref);

  const buildTargetOptions =
    buildTarget && (await tryToGetOptionsForTarget(architectHost, buildTarget));
  const ssr = buildTarget ? !!buildTargetOptions?.ssr : !!serverTarget;

  return {
    architect,
    architectHost,
    baseHref,
    host,
    buildTarget,
    browserTarget,
    prerenderTarget,
    serverTarget,
    serveTarget,
    workspaceProject,
    serveOptimizedImages,
    ssr,
    buildTargetOptions: buildTargetOptions || undefined,
  };
}

export async function getBrowserConfig(sourceDir: string, configuration: string) {
  const { architectHost, browserTarget, buildTarget, baseHref, workspaceProject } =
    await getContext(sourceDir, configuration);
  const buildOrBrowserTarget = buildTarget || browserTarget;
  if (!buildOrBrowserTarget) {
    throw new AssertionError({ message: "expected build or browser target defined" });
  }
  const [{ locales, defaultLocale }, targetOptions, builderName] = await Promise.all([
    localesForTarget(sourceDir, architectHost, buildOrBrowserTarget, workspaceProject),
    architectHost.getOptionsForTarget(buildOrBrowserTarget),
    architectHost.getBuilderNameForTarget(buildOrBrowserTarget),
  ]);

  const buildOutputPath =
    typeof targetOptions?.outputPath === "string"
      ? targetOptions.outputPath
      : join("dist", buildOrBrowserTarget.project);

  const outputPath = join(
    buildOutputPath,
    buildTarget && getBuilderType(builderName) === BuilderType.APPLICATION ? "browser" : "",
  );
  return { locales, baseHref, outputPath, defaultLocale };
}

export async function getServerConfig(sourceDir: string, configuration: string) {
  const {
    architectHost,
    host,
    buildTarget,
    serverTarget,
    browserTarget,
    baseHref,
    workspaceProject,
    serveOptimizedImages,
    ssr,
  } = await getContext(sourceDir, configuration);
  const buildOrBrowserTarget = buildTarget || browserTarget;
  if (!buildOrBrowserTarget) {
    throw new AssertionError({ message: "expected build or browser target to be defined" });
  }
  const browserTargetOptions = await architectHost.getOptionsForTarget(buildOrBrowserTarget);

  const buildOutputPath =
    typeof browserTargetOptions?.outputPath === "string"
      ? browserTargetOptions.outputPath
      : join("dist", buildOrBrowserTarget.project);

  const browserOutputPath = join(buildOutputPath, buildTarget ? "browser" : "")
    .split(sep)
    .join(posix.sep);
  const packageJson = JSON.parse(await host.readFile(join(sourceDir, "package.json")));

  if (!ssr) {
    return {
      packageJson,
      browserOutputPath,
      serverOutputPath: undefined,
      baseHref,
      bundleDependencies: false,
      externalDependencies: [],
      serverLocales: [],
      browserLocales: undefined,
      defaultLocale: undefined,
      serveOptimizedImages,
    };
  }
  const buildOrServerTarget = buildTarget || serverTarget;
  if (!buildOrServerTarget) {
    throw new AssertionError({ message: "expected build or server target to be defined" });
  }
  const { locales: serverLocales, defaultLocale } = await localesForTarget(
    sourceDir,
    architectHost,
    buildOrServerTarget,
    workspaceProject,
  );
  const serverTargetOptions = await architectHost.getOptionsForTarget(buildOrServerTarget);
  if (!serverTargetOptions) {
    throw new AssertionError({
      message: `expected "JsonObject" but got "${typeof serverTargetOptions}"`,
    });
  }
  const serverTargetOutputPath =
    typeof serverTargetOptions?.outputPath === "string"
      ? serverTargetOptions.outputPath
      : join("dist", buildOrServerTarget.project);

  const serverOutputPath = join(serverTargetOutputPath, buildTarget ? "server" : "")
    .split(sep)
    .join(posix.sep);
  if (serverLocales && !defaultLocale) {
    throw new FirebaseError(
      "It's required that your source locale to be one of the localize options",
    );
  }
  const serverEntry = buildTarget ? "server.mjs" : serverTarget && "main.js";
  const externalDependencies: string[] = (serverTargetOptions.externalDependencies as any) || [];
  const bundleDependencies = serverTargetOptions.bundleDependencies ?? true;
  const { locales: browserLocales } = await localesForTarget(
    sourceDir,
    architectHost,
    buildOrBrowserTarget,
    workspaceProject,
  );
  return {
    packageJson,
    browserOutputPath,
    serverOutputPath,
    baseHref,
    bundleDependencies,
    externalDependencies,
    serverLocales,
    browserLocales,
    defaultLocale,
    serveOptimizedImages,
    serverEntry,
  };
}

export async function getBuildConfig(sourceDir: string, configuration: string) {
  const { targetStringFromTarget } = await relativeRequire(sourceDir, "@angular-devkit/architect");
  const {
    buildTarget,
    browserTarget,
    baseHref,
    prerenderTarget,
    serverTarget,
    architectHost,
    workspaceProject,
    serveOptimizedImages,
    ssr,
    buildTargetOptions,
  } = await getContext(sourceDir, configuration);
  const targets = (
    buildTarget
      ? [buildTarget]
      : prerenderTarget
        ? [prerenderTarget]
        : [browserTarget, serverTarget].filter((it) => !!it)
  ).map((it) => targetStringFromTarget(it!));
  const buildOrBrowserTarget = buildTarget || browserTarget;
  if (!buildOrBrowserTarget) {
    throw new AssertionError({ message: "expected build or browser target defined" });
  }
  const locales = await localesForTarget(
    sourceDir,
    architectHost,
    buildOrBrowserTarget,
    workspaceProject,
  );
  return {
    targets,
    baseHref,
    locales,
    serveOptimizedImages,
    ssr,
    buildTargetOptions,
  };
}

/**
 * Get Angular version in the following format: `major.minor.patch`, ignoring
 * canary versions as it causes issues with semver comparisons.
 */
export function getAngularVersion(cwd: string): string | undefined {
  const dependency = findDependency("@angular/core", { cwd, depth: 0, omitDev: false });
  if (!dependency) return undefined;

  const angularVersionSemver = coerce(dependency.version);
  if (!angularVersionSemver) return dependency.version;

  return angularVersionSemver.toString();
}

/**
 * Try to get options for target, throw an error when expected target doesn't exist in the configuration.
 */
export async function tryToGetOptionsForTarget(
  architectHost: WorkspaceNodeModulesArchitectHost,
  target: Target,
): Promise<JsonObject | null> {
  return await architectHost.getOptionsForTarget(target).catch(throwCannotDetermineTarget);
}

function throwCannotDetermineTarget(error?: Error): never {
  throw new FirebaseError(
    `Unable to determine the application to deploy, specify a target via the FIREBASE_FRAMEWORKS_BUILD_TARGET environment variable.`,
    { original: error },
  );
}

/**
 * Extracts the builder type from a full builder string (everything after the colon)
 * @example
 * getBuilderType("@angular-devkit/build-angular:browser") // returns "browser"
 */
export function getBuilderType(builder: string): BuilderType | null {
  const colonIndex = builder.lastIndexOf(":");
  const builderType = colonIndex >= 0 ? builder.slice(colonIndex + 1) : undefined;
  if (!builderType || !Object.values(BuilderType).includes(builderType as BuilderType)) {
    return null;
  }
  return builderType as BuilderType;
}

/**
 * Hostname patterns Angular 22's SSR engine must accept for Firebase Hosting Web
 * Frameworks deployments to work end-to-end:
 *  - `*.web.app` and `*.firebaseapp.com` cover the public Hosting domains
 *    (including preview channels like `<site>--<channel>-<hash>.web.app`).
 *  - `*.a.run.app` covers the rotating Cloud Run hostnames the SSR function
 *    sees in its `Host` header (e.g. `fh-<hash>---<svc>-<region>.a.run.app`).
 */
export const ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS: readonly string[] = [
  "*.web.app",
  "*.firebaseapp.com",
  "*.a.run.app",
];

export type Angular22SsrSecurityWarning = {
  /** Recommended hostnames not present in the user's `allowedHosts` config. */
  allowedHostsMissing: string[];
  /** True if `trustProxyHeaders` is not configured anywhere we can detect. */
  trustProxyHeadersMissing: boolean;
};

/**
 * Detects the Angular 22 SSR security configuration gaps that break Firebase
 * Hosting Web Frameworks deployments. Returns `undefined` when the project is
 * not affected (older Angular, no SSR, or the user already configured both
 * `allowedHosts` and `trustProxyHeaders`).
 *
 * Signals considered:
 *  - `buildOptionsAllowedHosts`: the `security.allowedHosts` array from
 *    `angular.json`'s `application` builder options.
 *  - `serverEntrySource`: the raw text of the user's `src/server.ts` (or
 *    equivalent). If we see `allowedHosts` referenced there we treat the
 *    hostname allowlist as user-managed.
 */
export function getAngular22SsrSecurityWarning(opts: {
  version: string | undefined;
  ssr: boolean;
  buildOptionsAllowedHosts: string[] | undefined;
  serverEntrySource: string | undefined;
}): Angular22SsrSecurityWarning | undefined {
  if (!opts.version || !opts.ssr) return undefined;

  const semver = coerce(opts.version);
  if (!semver) return undefined;
  if (semver.major < 22) return undefined;

  const declared = opts.buildOptionsAllowedHosts ?? [];
  const serverHasAllowedHosts =
    !!opts.serverEntrySource && /\ballowedHosts\s*[:=]/.test(opts.serverEntrySource);

  let allowedHostsMissing: string[];
  if (declared.includes("*")) {
    allowedHostsMissing = [];
  } else if (serverHasAllowedHosts && declared.length === 0) {
    // The user is configuring allowed hosts at the engine level. We cannot
    // safely introspect the literal value, so trust the assignment exists.
    allowedHostsMissing = [];
  } else {
    // Match recommended hosts.
    // https://angular.dev/api/ssr/node/CommonEngineOptions#allowedHosts
    allowedHostsMissing = ANGULAR_22_RECOMMENDED_ALLOWED_HOSTS.filter(
      (required) => !declared.includes(required),
    );
  }

  const trustProxyHeadersMissing =
    !opts.serverEntrySource || !/\btrustProxyHeaders\s*[:=]/.test(opts.serverEntrySource);

  if (allowedHostsMissing.length === 0 && !trustProxyHeadersMissing) return undefined;
  return { allowedHostsMissing, trustProxyHeadersMissing };
}

/**
 * Renders the structured warning into a human-readable message intended for
 * `logLabeledWarning("angular", ...)`. Only the missing pieces are included so
 * the output stays focused on what the user actually has to fix.
 */
export function formatAngular22SsrSecurityWarning(warning: Angular22SsrSecurityWarning): string {
  const sections: string[] = [
    "Angular 22 enabled strict SSRF protection on its SSR engine. Firebase Hosting Web Frameworks routes SSR through Cloud Run with rotating hostnames; without explicit configuration the SSR function will return errors after deploy.",
  ];

  if (warning.allowedHostsMissing.length > 0) {
    sections.push(
      [
        "Add these hostnames to security.allowedHosts in angular.json:",
        `  ${JSON.stringify(warning.allowedHostsMissing)}`,
        `${clc.bold("Documentation")}: https://angular.dev/best-practices/security#configuring-allowed-hosts`,
      ].join("\n"),
    );
  }

  if (warning.trustProxyHeadersMissing) {
    sections.push(
      [
        "Enable trustProxyHeaders to support host validation via Firebase Hosting.",
        `${clc.bold("Documentation")}: https://angular.dev/best-practices/security#configuring-trusted-proxy-headers`,
      ].join("\n"),
    );
  }

  const message = sections.join("\n\n");
  return message
    .split("\n")
    .map((line, i) => (i === 0 ? line : "  " + line))
    .join("\n")
    .concat("\n");
}

/**
 * Surfaces an angular-labeled warning when the project ships Angular 22 SSR
 * without the `security.allowedHosts` / `trustProxyHeaders` configuration
 * Firebase Hosting Web Frameworks needs at runtime.
 *
 * `buildTargetOptions` is the already-resolved `application` builder options
 * (threaded out of `getBuildConfig`), so this check does not re-run the
 * expensive `getContext`/`angular.json` parse the main build flow already did.
 *
 * Best-effort: any unexpected failure (unparseable options, missing source
 * file) is swallowed so the security check never blocks a build that would
 * otherwise succeed. The decision logic lives in the pure, unit-tested
 * `getAngular22SsrSecurityWarning`; this orchestrator is just glue.
 */
export async function maybeWarnAngular22SsrSecurity(
  dir: string,
  opts: { ssr: boolean; buildTargetOptions: JsonObject | null | undefined },
): Promise<void> {
  try {
    const version = getAngularVersion(dir);
    if (!version || !opts.ssr) return;

    const buildOptionsAllowedHosts = extractAngular22AllowedHostsFromBuildOptions(
      opts.buildTargetOptions,
    );
    const entryPath = getAngular22ServerEntryPath(opts.buildTargetOptions);
    let serverEntrySource: string | undefined;
    try {
      serverEntrySource = await readFile(join(dir, entryPath), "utf8");
    } catch {
      // A missing/unreadable entry just means we cannot confirm manual
      // wiring — keep going so the warning still fires.
    }

    const warning = getAngular22SsrSecurityWarning({
      version,
      ssr: opts.ssr,
      buildOptionsAllowedHosts,
      serverEntrySource,
    });
    if (!warning) return;

    logLabeledWarning("Angular 22", formatAngular22SsrSecurityWarning(warning));
  } catch {
    // Never let the security pre-flight break a build.
  }
}

/**
 * Pure extractor: pulls the `security.allowedHosts` array (string entries
 * only) out of an Angular Architect target's resolved options. Kept separate
 * from the I/O wrapper so the parsing rules can be tested without booting an
 * `@angular-devkit` workspace.
 */
export function extractAngular22AllowedHostsFromBuildOptions(
  options: JsonObject | null | undefined,
): string[] | undefined {
  const security = options?.security as { allowedHosts?: unknown } | undefined;
  if (!security || !Array.isArray(security.allowedHosts)) return undefined;
  return security.allowedHosts.filter((h): h is string => typeof h === "string");
}

/**
 * The conventional SSR server entry the `@angular/ssr` schematic generates and
 * points `ssr.entry` at. Used as the fallback when the build options enable SSR
 * (`ssr: true` / `ssr: {}`) without an explicit `entry` — Angular SSR sources
 * are always TypeScript, so `.ts` is the only conventional extension.
 */
export const ANGULAR_22_DEFAULT_SERVER_ENTRY = "src/server.ts";

/**
 * Resolves the SSR server entry *source* path to inspect for manual
 * `allowedHosts`/`trustProxyHeaders` wiring.
 *
 * Prefers the explicit `options.ssr.entry` from the `@angular/build:application`
 * builder (supports custom layouts). `ssr.entry` is optional in Angular 22 —
 * the boolean `ssr: true` form and the object form without `entry` both still
 * produce real SSR — so when no explicit entry is declared we fall back to the
 * conventional `src/server.ts` the schematic generates. A non-existent file is
 * handled downstream (best-effort read), keeping the check fail-safe.
 */
export function getAngular22ServerEntryPath(options: JsonObject | null | undefined): string {
  const ssr = options?.ssr as { entry?: unknown } | boolean | undefined;
  if (ssr && typeof ssr !== "boolean" && typeof ssr.entry === "string") {
    return ssr.entry;
  }
  return ANGULAR_22_DEFAULT_SERVER_ENTRY;
}
