import type { Target } from "@angular-devkit/architect";
import type { ProjectDefinition } from "@angular-devkit/core/src/workspace";
import type { WorkspaceNodeModulesArchitectHost } from "@angular-devkit/architect/node";

import { AngularI18nConfig } from "./interfaces";
import { relativeRequire, validateLocales } from "../utils";
import { FirebaseError } from "../../error";
import { join } from "path";
import { BUILD_TARGET_PURPOSE } from "../interfaces";

async function localesForTarget(
  dir: string,
  architectHost: WorkspaceNodeModulesArchitectHost,
  target: Target,
  workspaceProject: ProjectDefinition
) {
  const { targetStringFromTarget } = relativeRequire(dir, "@angular-devkit/architect");
  const targetOptions = await architectHost.getOptionsForTarget(target);
  if (!targetOptions)
    throw new FirebaseError(`Couldn't find options for ${targetStringFromTarget(target)}.`);

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
        'All your i18n locales must have a baseHref of "" on Firebase, errored on sourceLocale.'
      );
    defaultLocale = i18n.sourceLocale.code;
    if (targetOptions.localize === true) {
      locales = [defaultLocale];
      for (const [locale, { baseHref }] of Object.entries(i18n.locales)) {
        if (baseHref !== "")
          throw new FirebaseError(
            `All your i18n locales must have a baseHref of \"\" on Firebase, errored on ${locale}.`
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
  ANGULAR_FIRE_DEPLOY_TARGET = "@angular/fire:deploy",
  BUILD_TARGET = "@angular-devkit/build-angular:browser",
  PRERENDER_TARGET = "@nguniversal/builders:prerender",
  DEV_SERVER_TARGET = "@angular-devkit/build-angular:dev-server",
  SSR_DEV_SERVER_TARGET = "@nguniversal/builders:ssr-dev-server",
}

const DEV_SERVER_TARGETS: string[] = [
  ExpectedBuilder.DEV_SERVER_TARGET,
  ExpectedBuilder.SSR_DEV_SERVER_TARGET,
];

function getValidBuilders(purpose: BUILD_TARGET_PURPOSE): string[] {
  return [
    ExpectedBuilder.ANGULAR_FIRE_DEPLOY_TARGET,
    ExpectedBuilder.BUILD_TARGET,
    ExpectedBuilder.PRERENDER_TARGET,
    ...(purpose === "deploy" ? [] : DEV_SERVER_TARGETS),
  ];
}

export async function getAllTargets(purpose: BUILD_TARGET_PURPOSE, dir: string) {
  const validBuilders = getValidBuilders(purpose);
  const { NodeJsAsyncHost } = relativeRequire(dir, "@angular-devkit/core/node");
  const { workspaces } = relativeRequire(dir, "@angular-devkit/core");
  const { targetStringFromTarget } = relativeRequire(dir, "@angular-devkit/architect");

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
  const { NodeJsAsyncHost } = relativeRequire(dir, "@angular-devkit/core/node");
  const { workspaces } = relativeRequire(dir, "@angular-devkit/core");
  const { WorkspaceNodeModulesArchitectHost } = relativeRequire(
    dir,
    "@angular-devkit/architect/node"
  );
  const { Architect, targetFromTargetString, targetStringFromTarget } = relativeRequire(
    dir,
    "@angular-devkit/architect"
  );
  const { parse } = relativeRequire(dir, "jsonc-parser");

  const host = workspaces.createWorkspaceHost(new NodeJsAsyncHost());
  const { workspace } = await workspaces.readWorkspace(dir, host);
  const architectHost = new WorkspaceNodeModulesArchitectHost(workspace, dir);
  const architect = new Architect(architectHost);

  let overrideTarget: Target | undefined;
  let project: string | undefined;
  let browserTarget: Target | undefined;
  let serverTarget: Target | undefined;
  let prerenderTarget: Target | undefined;
  let serveTarget: Target | undefined;
  let serveOptimizedImages = false;

  let deployTargetName;
  let configuration: string | undefined = undefined;
  if (targetOrConfiguration) {
    try {
      overrideTarget = targetFromTargetString(targetOrConfiguration);
      configuration = overrideTarget.configuration;
      project = overrideTarget.project;
    } catch (e) {
      deployTargetName = "deploy";
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
      "Unable to determine the application to deploy, specify a target via the FIREBASE_FRAMEWORKS_BUILD_TARGET environment variable"
    );

  const workspaceProject = workspace.projects.get(project);
  if (!workspaceProject) throw new FirebaseError(`No project ${project} found.`);

  if (overrideTarget) {
    const target = workspaceProject.targets.get(overrideTarget.target)!;
    const builder = target.builder;
    if (builder === ExpectedBuilder.ANGULAR_FIRE_DEPLOY_TARGET)
      deployTargetName = overrideTarget.target;
    if (builder === ExpectedBuilder.BUILD_TARGET) browserTarget = overrideTarget;
    if (builder === ExpectedBuilder.PRERENDER_TARGET) prerenderTarget = overrideTarget;
    if (typeof builder === "string" && DEV_SERVER_TARGETS.includes(builder))
      serveTarget = overrideTarget;
  }

  const deployTargetDefinition = deployTargetName
    ? workspaceProject.targets.get(deployTargetName)
    : undefined;
  if (deployTargetDefinition?.builder === ExpectedBuilder.ANGULAR_FIRE_DEPLOY_TARGET) {
    const options = deployTargetDefinition.options;
    if (typeof options?.prerenderTarget === "string")
      prerenderTarget = targetFromTargetString(options.prerenderTarget);
    if (typeof options?.browserTarget === "string")
      browserTarget = targetFromTargetString(options.browserTarget);
    if (typeof options?.serverTarget === "string")
      serverTarget = targetFromTargetString(options.serverTarget);
    if (options?.serveOptimizedImages) {
      serveOptimizedImages = true;
    }
    if (!browserTarget)
      throw new Error("ng-deploy is missing a browser target. Plase check your angular.json.");
    if (prerenderTarget) {
      const prerenderOptions = await architectHost.getOptionsForTarget(prerenderTarget);
      if (targetStringFromTarget(browserTarget) !== prerenderOptions?.browserTarget)
        throw new Error(
          "ng-deploy's browserTarget and prerender's browserTarget do not match. Please check your angular.json"
        );
      if (serverTarget && targetStringFromTarget(serverTarget) !== prerenderOptions?.serverTarget)
        throw new Error(
          "ng-deploy's serverTarget and prerender's serverTarget do not match. Please check your angular.json"
        );
      if (!serverTarget)
        console.warn(
          "Treating the application as fully rendered. Add a serverTarget to your deploy target in angular.json to utilize server-side rendering."
        );
    }
  }

  if (!overrideTarget && !prerenderTarget && workspaceProject.targets.has("prerender")) {
    const { defaultConfiguration = "production" } = workspaceProject.targets.get("prerender")!;
    prerenderTarget = { project, target: "prerender", configuration: defaultConfiguration };
  }

  if (serveTarget) {
    const options = await architectHost.getOptionsForTarget(serveTarget);
    if (typeof options?.browserTarget !== "string")
      throw new Error(
        `${serveTarget.target} browserTarget expected to be string, check your angular.json.`
      );
    browserTarget = targetFromTargetString(options.browserTarget);
    if (options?.serverTarget) {
      if (typeof options.serverTarget !== "string")
        throw new Error(
          `${serveTarget.target} serverTarget expected to be string, check your angular.json.`
        );
      serverTarget = targetFromTargetString(options.serverTarget);
    }
  } else if (prerenderTarget) {
    const options = await architectHost.getOptionsForTarget(prerenderTarget);
    if (typeof options?.browserTarget !== "string")
      throw new Error("Prerender browserTarget expected to be string, check your angular.json.");
    browserTarget = targetFromTargetString(options.browserTarget);
    if (typeof options?.serverTarget !== "string")
      throw new Error("Prerender serverTarget expected to be string, check your angular.json.");
    serverTarget = targetFromTargetString(options.serverTarget);
  }

  if (!browserTarget && workspaceProject.targets.has("build")) {
    const { defaultConfiguration = "production" } = workspaceProject.targets.get("build")!;
    browserTarget = { project, target: "build", configuration: defaultConfiguration };
  }

  if (!serverTarget && workspaceProject.targets.has("server")) {
    const { defaultConfiguration = "production" } = workspaceProject.targets.get("server")!;
    serverTarget = { project, target: "server", configuration: defaultConfiguration };
  }

  if (!serveTarget) {
    if (serverTarget && workspaceProject.targets.has("serve-ssr")) {
      const { defaultConfiguration = "development" } = workspaceProject.targets.get("serve-ssr")!;
      serveTarget = { project, target: "serve-ssr", configuration: defaultConfiguration };
    } else if (workspaceProject.targets.has("serve")) {
      const { defaultConfiguration = "development" } = workspaceProject.targets.get("serve")!;
      serveTarget = { project, target: "serve", configuration: defaultConfiguration };
    }
  }

  if (configuration) {
    if (prerenderTarget) prerenderTarget.configuration = configuration;
    if (serverTarget) serverTarget.configuration = configuration;
    if (browserTarget) browserTarget.configuration = configuration;
    if (serveTarget) serveTarget.configuration = configuration;
  }

  if (!browserTarget) throw new FirebaseError(`No browser target on ${project}`);
  const browserTargetOptions = await architectHost.getOptionsForTarget(browserTarget);
  if (!browserTargetOptions) {
    throw new FirebaseError(`Couldn't find options for ${targetStringFromTarget(browserTarget)}.`);
  }

  const baseHref = browserTargetOptions.baseHref || "/";
  if (typeof baseHref !== "string") {
    throw new FirebaseError(
      `baseHref on ${targetStringFromTarget(browserTarget)} was not a string`
    );
  }

  return {
    architect,
    architectHost,
    baseHref,
    host,
    browserTarget,
    prerenderTarget,
    serverTarget,
    serveTarget,
    workspaceProject,
    serveOptimizedImages,
  };
}

export async function getBrowserConfig(sourceDir: string, configuration: string) {
  const { architectHost, browserTarget, baseHref, workspaceProject } = await getContext(
    sourceDir,
    configuration
  );
  const { locales, defaultLocale } = await localesForTarget(
    sourceDir,
    architectHost,
    browserTarget,
    workspaceProject
  );
  const browserTargetOptions = await architectHost.getOptionsForTarget(browserTarget);
  if (typeof browserTargetOptions?.outputPath !== "string")
    throw new Error("browserTarget output path is not a string");
  const outputPath = browserTargetOptions.outputPath;
  return { locales, baseHref, outputPath, defaultLocale };
}

export async function getServerConfig(sourceDir: string, configuration: string) {
  const {
    architectHost,
    host,
    serverTarget,
    browserTarget,
    baseHref,
    workspaceProject,
    serveOptimizedImages,
  } = await getContext(sourceDir, configuration);
  const browserTargetOptions = await architectHost.getOptionsForTarget(browserTarget);
  if (typeof browserTargetOptions?.outputPath !== "string")
    throw new Error("browserTarget output path is not a string");
  const browserOutputPath = browserTargetOptions.outputPath;
  const packageJson = JSON.parse(await host.readFile(join(sourceDir, "package.json")));
  if (!serverTarget) {
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
  const { locales: serverLocales, defaultLocale } = await localesForTarget(
    sourceDir,
    architectHost,
    serverTarget,
    workspaceProject
  );
  const serverTargetOptions = await architectHost.getOptionsForTarget(serverTarget);
  if (typeof serverTargetOptions?.outputPath !== "string")
    throw new Error("serverTarget output path is not a string");
  const serverOutputPath = serverTargetOptions.outputPath;
  if (serverLocales && !defaultLocale) {
    throw new FirebaseError(
      "It's required that your source locale to be one of the localize options"
    );
  }
  const externalDependencies: string[] = (serverTargetOptions.externalDependencies as any) || [];
  const bundleDependencies = serverTargetOptions.bundleDependencies ?? true;
  const { locales: browserLocales } = await localesForTarget(
    sourceDir,
    architectHost,
    browserTarget,
    workspaceProject
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
  };
}

export async function getBuildConfig(sourceDir: string, configuration: string) {
  const { targetStringFromTarget } = relativeRequire(sourceDir, "@angular-devkit/architect");
  const {
    browserTarget,
    baseHref,
    prerenderTarget,
    serverTarget,
    architectHost,
    workspaceProject,
    serveOptimizedImages,
  } = await getContext(sourceDir, configuration);
  const targets = (
    prerenderTarget ? [prerenderTarget] : [browserTarget, serverTarget].filter((it) => !!it)
  ).map((it) => targetStringFromTarget(it!));
  const locales = await localesForTarget(sourceDir, architectHost, browserTarget, workspaceProject);
  return {
    targets,
    baseHref,
    serverTarget,
    locales,
    serveOptimizedImages,
  };
}
