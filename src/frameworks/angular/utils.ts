import type { Target } from "@angular-devkit/architect";
import type { ProjectDefinition } from "@angular-devkit/core/src/workspace";
import type { WorkspaceNodeModulesArchitectHost } from "@angular-devkit/architect/node";

import { AngularI18nConfig } from "./interfaces";
import { relativeRequire } from "../utils";
import { FirebaseError } from "../../error";
import { join } from "path";

async function localesForTarget(
  dir: string,
  architectHost: WorkspaceNodeModulesArchitectHost,
  target: Target,
  workspaceProject: ProjectDefinition
) {
  const { targetStringFromTarget } = relativeRequire(dir, "@angular-devkit/architect");
  const browserTargetOptions = await architectHost.getOptionsForTarget(target);
  if (!browserTargetOptions)
    throw new FirebaseError(`Couldn't find options for ${targetStringFromTarget(target)}.`);

  let locales: string[] | undefined = undefined;
  let defaultLocale: string | undefined = undefined;
  if (browserTargetOptions.localize) {
    const i18n: AngularI18nConfig | undefined = workspaceProject.extensions?.i18n as any;
    if (!i18n) throw new FirebaseError(`No i18n config on project.`);
    if (browserTargetOptions.localize === true) {
      defaultLocale = i18n.sourceLocale;
      locales = Object.keys(i18n.locales);
    } else if (Array.isArray(browserTargetOptions.localize)) {
      locales ||= [];
      for (const locale of browserTargetOptions.localize) {
        if (typeof locale !== "string") continue;
        locales.push(locale);
      }
      if (locales.includes(i18n.sourceLocale)) {
        defaultLocale = i18n.sourceLocale;
      }
    }
  }
  return { locales, defaultLocale };
}

// TODO(jamesdaniels) memoize, dry up
export async function getContext(dir: string) {
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

  let project: string | undefined = (globalThis as any).NG_DEPLOY_PROJECT;
  let browserTarget: Target | undefined;
  let serverTarget: Target | undefined;
  let prerenderTarget: Target | undefined;
  let serveTarget: Target | undefined;
  let ngOptimizedImage = false;

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
      "Unable to determine the application to deploy, you should use `ng deploy` via @angular/fire."
    );

  const workspaceProject = workspace.projects.get(project);
  if (!workspaceProject) throw new FirebaseError(`No project ${project} found.`);

  const deployTargetDefinition = workspaceProject.targets.get("deploy");

  if (deployTargetDefinition?.builder === "@angular/fire:deploy") {
    const options = deployTargetDefinition.options;
    if (typeof options?.prerenderTarget === "string")
      prerenderTarget = targetFromTargetString(options.prerenderTarget);
    if (typeof options?.browserTarget === "string")
      browserTarget = targetFromTargetString(options.browserTarget);
    if (typeof options?.serverTarget === "string")
      serverTarget = targetFromTargetString(options.serverTarget);
    if (options?.ngOptimizedImage) {
      ngOptimizedImage = true;
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
  } else if (workspaceProject.targets.has("prerender")) {
    const target = workspaceProject.targets.get("prerender")!;
    const configurations = Object.keys(target.configurations!);
    const configuration = configurations.includes("production")
      ? "production"
      : target.defaultConfiguration;
    if (!configuration)
      throw new Error("No production or default configutation found for prerender.");
    if (configuration !== "production")
      console.warn(
        `Using ${configuration} configuration for the prerender, we suggest adding a production target.`
      );
    prerenderTarget = { project, target: "prerender", configuration };
    const production = await architectHost.getOptionsForTarget(prerenderTarget);
    if (typeof production?.browserTarget !== "string")
      throw new Error("Prerender browserTarget expected to be string, check your angular.json.");
    browserTarget = targetFromTargetString(production.browserTarget);
    if (typeof production?.serverTarget !== "string")
      throw new Error("Prerender serverTarget expected to be string, check your angular.json.");
    serverTarget = targetFromTargetString(production.serverTarget);
  } else {
    if (workspaceProject.targets.has("build")) {
      const target = workspaceProject.targets.get("build")!;
      const configurations = Object.keys(target.configurations!);
      const configuration = configurations.includes("production")
        ? "production"
        : target.defaultConfiguration;
      if (!configuration)
        throw new Error("No production or default configutation found for build.");
      if (configuration !== "production")
        console.warn(
          `Using ${configuration} configuration for the browser deploy, we suggest adding a production target.`
        );
      browserTarget = { project, target: "build", configuration };
    }
    if (workspaceProject.targets.has("server")) {
      const target = workspaceProject.targets.get("server")!;
      const configurations = Object.keys(target.configurations!);
      const configuration = configurations.includes("production")
        ? "production"
        : target.defaultConfiguration;
      if (!configuration)
        throw new Error("No production or default configutation found for server.");
      if (configuration !== "production")
        console.warn(
          `Using ${configuration} configuration for the server deploy, we suggest adding a production target.`
        );
      serverTarget = { project, target: "server", configuration };
    }
  }

  if (serverTarget && workspaceProject.targets.has("serve-ssr")) {
    const target = workspaceProject.targets.get("serve-ssr")!;
    const configurations = Object.keys(target.configurations!);
    const configuration = configurations.includes("development")
      ? "development"
      : target.defaultConfiguration;
    if (!configuration)
      throw new Error("No development or default configutation found for serve-ssr.");
    if (configuration !== "development")
      console.warn(
        `Using ${configuration} configuration for the local server, we suggest adding a development target.`
      );
    serveTarget = { project, target: "serve-ssr", configuration };
  } else if (workspaceProject.targets.has("serve")) {
    if (serverTarget) console.warn(`No server-ssr target found.`);
    const target = workspaceProject.targets.get("serve")!;
    const configurations = Object.keys(target.configurations!);
    const configuration = configurations.includes("development")
      ? "development"
      : target.defaultConfiguration;
    if (!configuration) throw new Error("No development or default configutation found for serve.");
    if (configuration !== "development")
      console.warn(
        `Using ${configuration} configuration for the local server, we suggest adding a development target.`
      );
    serveTarget = { project, target: "serve", configuration };
  }

  if (!browserTarget) throw new FirebaseError(`No browser target on ${project}`);
  const browserTargetOptions = await architectHost.getOptionsForTarget(browserTarget);
  if (!browserTargetOptions)
    throw new FirebaseError(`Couldn't find options for ${targetStringFromTarget(browserTarget)}.`);

  const baseHref = browserTargetOptions.baseHref || "";
  if (typeof baseHref !== "string")
    throw new FirebaseError(
      `baseHref on ${targetStringFromTarget(browserTarget)} was not a string`
    );

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
    ngOptimizedImage,
  };
}

export async function getBrowserConfig(sourceDir: string) {
  const { architectHost, browserTarget, baseHref, workspaceProject } = await getContext(sourceDir);
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

export async function getServerConfig(sourceDir: string) {
  const {
    architectHost,
    host,
    serverTarget,
    browserTarget,
    baseHref,
    workspaceProject,
    ngOptimizedImage,
  } = await getContext(sourceDir);
  if (!serverTarget) throw new Error("No server target");
  const { locales, defaultLocale } = await localesForTarget(
    sourceDir,
    architectHost,
    serverTarget,
    workspaceProject
  );
  const serverTargetOptions = await architectHost.getOptionsForTarget(serverTarget);
  if (typeof serverTargetOptions?.outputPath !== "string")
    throw new Error("serverTarget output path is not a string");
  const browserTargetOptions = await architectHost.getOptionsForTarget(browserTarget);
  if (typeof browserTargetOptions?.outputPath !== "string")
    throw new Error("browserTarget output path is not a string");
  const browserOutputPath = browserTargetOptions.outputPath;
  const serverOutputPath = serverTargetOptions.outputPath;
  if (locales && !defaultLocale) {
    throw new FirebaseError(
      "It's required that your source locale to be one of the localize options"
    );
  }
  const packageJson = JSON.parse(await host.readFile(join(sourceDir, "package.json")));
  const externalDependencies: string[] = (serverTargetOptions.externalDependencies as any) || [];
  const bundleDependencies = serverTargetOptions.bundleDependencies ?? true;
  return {
    packageJson,
    browserOutputPath,
    serverOutputPath,
    baseHref,
    bundleDependencies,
    externalDependencies,
    locales,
    defaultLocale,
    ngOptimizedImage,
  };
}

export async function getBuildConfig(sourceDir: string) {
  const { targetStringFromTarget } = relativeRequire(sourceDir, "@angular-devkit/architect");
  const {
    browserTarget,
    prerenderTarget,
    serverTarget,
    architectHost,
    workspaceProject,
    ngOptimizedImage,
  } = await getContext(sourceDir);
  const targets = (
    prerenderTarget ? [prerenderTarget] : [browserTarget, serverTarget].filter((it) => !it)
  ).map((it) => targetStringFromTarget(it!));
  const locales = await localesForTarget(sourceDir, architectHost, browserTarget, workspaceProject);
  return {
    targets,
    serverTarget,
    locales,
    ngOptimizedImage,
  };
}
