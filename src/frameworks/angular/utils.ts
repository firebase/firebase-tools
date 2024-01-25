import type { Target } from "@angular-devkit/architect";
import type { ProjectDefinition } from "@angular-devkit/core/src/workspace";
import type { WorkspaceNodeModulesArchitectHost } from "@angular-devkit/architect/node";

import { AngularI18nConfig } from "./interfaces";
import { findDependency, relativeRequire, validateLocales } from "../utils";
import { FirebaseError } from "../../error";
import { join, posix, sep } from "path";
import { BUILD_TARGET_PURPOSE } from "../interfaces";
import { AssertionError } from "assert";
import { assertIsString } from "../../utils";
import { coerce } from "semver";

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

const enum ExpectedBuilder {
  APPLICATION = "@angular-devkit/build-angular:application",
  BROWSER_ESBUILD = "@angular-devkit/build-angular:browser-esbuild",
  DEPLOY = "@angular/fire:deploy",
  DEV_SERVER = "@angular-devkit/build-angular:dev-server",
  LEGACY_BROWSER = "@angular-devkit/build-angular:browser",
  LEGACY_NGUNIVERSAL_PRERENDER = "@nguniversal/builders:prerender",
  LEGACY_DEVKIT_PRERENDER = "@angular-devkit/build-angular:prerender",
  LEGACY_SERVER = "@angular-devkit/build-angular:server",
  LEGACY_NGUNIVERSAL_SSR_DEV_SERVER = "@nguniversal/builders:ssr-dev-server",
  LEGACY_DEVKIT_SSR_DEV_SERVER = "@angular-devkit/build-angular:ssr-dev-server",
}

const DEV_SERVER_TARGETS: string[] = [
  ExpectedBuilder.DEV_SERVER,
  ExpectedBuilder.LEGACY_NGUNIVERSAL_SSR_DEV_SERVER,
  ExpectedBuilder.LEGACY_DEVKIT_SSR_DEV_SERVER,
];

function getValidBuilders(purpose: BUILD_TARGET_PURPOSE): string[] {
  return [
    ExpectedBuilder.APPLICATION,
    ExpectedBuilder.BROWSER_ESBUILD,
    ExpectedBuilder.DEPLOY,
    ExpectedBuilder.LEGACY_BROWSER,
    ExpectedBuilder.LEGACY_DEVKIT_PRERENDER,
    ExpectedBuilder.LEGACY_NGUNIVERSAL_PRERENDER,
    ...(purpose === "deploy" ? [] : DEV_SERVER_TARGETS),
  ];
}

export async function getAllTargets(purpose: BUILD_TARGET_PURPOSE, dir: string) {
  const validBuilders = getValidBuilders(purpose);
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
      if (!validBuilders.includes(targetDefinition.builder)) return;
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

  if (!project)
    throw new FirebaseError(
      "Unable to determine the application to deploy, specify a target via the FIREBASE_FRAMEWORKS_BUILD_TARGET environment variable",
    );

  const workspaceProject = workspace.projects.get(project);
  if (!workspaceProject) throw new FirebaseError(`No project ${project} found.`);

  if (overrideTarget) {
    const target = workspaceProject.targets.get(overrideTarget.target)!;
    const builder = target.builder;
    switch (builder) {
      case ExpectedBuilder.DEPLOY:
        deployTarget = overrideTarget;
        break;
      case ExpectedBuilder.APPLICATION:
        buildTarget = overrideTarget;
        break;
      case ExpectedBuilder.BROWSER_ESBUILD:
      case ExpectedBuilder.LEGACY_BROWSER:
        browserTarget = overrideTarget;
        break;
      case ExpectedBuilder.LEGACY_DEVKIT_PRERENDER:
      case ExpectedBuilder.LEGACY_NGUNIVERSAL_PRERENDER:
        prerenderTarget = overrideTarget;
        break;
      case ExpectedBuilder.DEV_SERVER:
      case ExpectedBuilder.LEGACY_NGUNIVERSAL_SSR_DEV_SERVER:
      case ExpectedBuilder.LEGACY_DEVKIT_SSR_DEV_SERVER:
        serveTarget = overrideTarget;
        break;
      default:
        throw new FirebaseError(`builder ${builder} not known.`);
    }
  } else if (workspaceProject.targets.has("deploy")) {
    const { builder, defaultConfiguration = "production" } =
      workspaceProject.targets.get("deploy")!;
    if (builder === ExpectedBuilder.DEPLOY) {
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
      const target = {
        project,
        target: "build",
        configuration: configuration || defaultConfiguration,
      };
      if (
        builder === ExpectedBuilder.LEGACY_BROWSER ||
        builder === ExpectedBuilder.BROWSER_ESBUILD
      ) {
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
      if (target === deployTarget && builder === ExpectedBuilder.DEPLOY) continue;
      if (target === buildTarget && builder === ExpectedBuilder.APPLICATION) continue;
      if (target === browserTarget && builder === ExpectedBuilder.BROWSER_ESBUILD) continue;
      if (target === browserTarget && builder === ExpectedBuilder.LEGACY_BROWSER) continue;
      if (target === prerenderTarget && builder === ExpectedBuilder.LEGACY_DEVKIT_PRERENDER)
        continue;
      if (target === prerenderTarget && builder === ExpectedBuilder.LEGACY_NGUNIVERSAL_PRERENDER)
        continue;
      if (target === serverTarget && builder === ExpectedBuilder.LEGACY_SERVER) continue;
      if (target === serveTarget && builder === ExpectedBuilder.LEGACY_NGUNIVERSAL_SSR_DEV_SERVER)
        continue;
      if (target === serveTarget && builder === ExpectedBuilder.LEGACY_DEVKIT_SSR_DEV_SERVER)
        continue;
      if (target === serveTarget && builder === ExpectedBuilder.DEV_SERVER) continue;
      throw new FirebaseError(
        `${definition.builder} (${targetString}) is not a recognized builder. Please check your angular.json`,
      );
    }
  }

  const buildOrBrowserTarget = buildTarget || browserTarget;
  if (!buildOrBrowserTarget) {
    throw new FirebaseError(`No build target on ${project}`);
  }
  const browserTargetOptions = await architectHost.getOptionsForTarget(buildOrBrowserTarget);
  if (!browserTargetOptions) {
    const targetString = targetStringFromTarget(buildOrBrowserTarget);
    throw new FirebaseError(`Couldn't find options for ${targetString}.`);
  }

  const baseHref = browserTargetOptions.baseHref || "/";
  assertIsString(baseHref);

  const buildTargetOptions = buildTarget && (await architectHost.getOptionsForTarget(buildTarget));
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
  };
}

export async function getBrowserConfig(sourceDir: string, configuration: string) {
  const { architectHost, browserTarget, buildTarget, baseHref, workspaceProject } =
    await getContext(sourceDir, configuration);
  const buildOrBrowserTarget = buildTarget || browserTarget;
  if (!buildOrBrowserTarget) {
    throw new AssertionError({ message: "expected build or browser target defined" });
  }
  const { locales, defaultLocale } = await localesForTarget(
    sourceDir,
    architectHost,
    buildOrBrowserTarget,
    workspaceProject,
  );
  const targetOptions = await architectHost.getOptionsForTarget(buildOrBrowserTarget);
  assertIsString(targetOptions?.outputPath);
  const outputPath = join(targetOptions.outputPath, buildTarget ? "browser" : "");
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
  assertIsString(browserTargetOptions?.outputPath);
  const browserOutputPath = join(browserTargetOptions.outputPath, buildTarget ? "browser" : "")
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
  assertIsString(serverTargetOptions?.outputPath);
  const serverOutputPath = join(serverTargetOptions.outputPath, buildTarget ? "server" : "")
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
