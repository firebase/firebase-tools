import { join, posix } from "path";
import { execSync } from "child_process";
import { spawn, sync as spawnSync } from "cross-spawn";
import { copy, pathExists } from "fs-extra";
import { mkdir } from "fs/promises";

import {
  BuildResult,
  Discovery,
  FrameworkType,
  SupportLevel,
  BUILD_TARGET_PURPOSE,
} from "../interfaces";
import {
  simpleProxy,
  relativeRequire,
  getNodeModuleBin,
  warnIfCustomBuildScript,
  findDependency,
} from "../utils";
import {
  getAllTargets,
  getAngularVersion,
  getBrowserConfig,
  getBuildConfig,
  getContext,
  getServerConfig,
} from "./utils";
import { I18N_ROOT, SHARP_VERSION } from "../constants";
import { FirebaseError } from "../../error";

export const name = "Angular";
export const support = SupportLevel.Preview;
export const type = FrameworkType.Framework;
export const docsUrl = "https://firebase.google.com/docs/hosting/frameworks/angular";

const DEFAULT_BUILD_SCRIPT = ["ng build"];

export const supportedRange = "14 - 17";

export async function discover(dir: string): Promise<Discovery | undefined> {
  if (!(await pathExists(join(dir, "package.json")))) return;
  if (!(await pathExists(join(dir, "angular.json")))) return;
  const version = getAngularVersion(dir);
  return { mayWantBackend: true, version };
}

export function init(setup: any, config: any) {
  execSync(
    `npx --yes -p @angular/cli@"${supportedRange}" ng new ${setup.projectId} --directory ${setup.hosting.source} --skip-git`,
    {
      stdio: "inherit",
      cwd: config.projectDir,
    },
  );
  return Promise.resolve();
}

export async function build(dir: string, configuration: string): Promise<BuildResult> {
  const {
    targets,
    serveOptimizedImages,
    locales,
    baseHref: baseUrl,
    ssr,
  } = await getBuildConfig(dir, configuration);
  await warnIfCustomBuildScript(dir, name, DEFAULT_BUILD_SCRIPT);
  for (const target of targets) {
    // TODO there is a bug here. Spawn for now.
    // await scheduleTarget(prerenderTarget);
    const cli = getNodeModuleBin("ng", dir);
    const result = spawnSync(cli, ["run", target], {
      cwd: dir,
      stdio: "inherit",
    });
    if (result.status !== 0) throw new FirebaseError(`Unable to build ${target}`);
  }

  const wantsBackend = ssr || serveOptimizedImages;
  const rewrites = ssr
    ? []
    : [
        {
          source: posix.join(baseUrl, "**"),
          destination: posix.join(baseUrl, "index.html"),
        },
      ];
  const i18n = !!locales;
  return { wantsBackend, i18n, rewrites, baseUrl };
}

export async function getDevModeHandle(dir: string, configuration: string) {
  const { targetStringFromTarget } = await relativeRequire(dir, "@angular-devkit/architect");
  const { serveTarget } = await getContext(dir, configuration);
  if (!serveTarget) throw new Error("Could not find the serveTarget");
  const host = new Promise<string>((resolve, reject) => {
    // Can't use scheduleTarget since that—like prerender—is failing on an ESM bug
    // will just grep for the hostname
    const cli = getNodeModuleBin("ng", dir);
    const serve = spawn(cli, ["run", targetStringFromTarget(serveTarget), "--host", "localhost"], {
      cwd: dir,
    });
    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const match = data.toString().match(/(http:\/\/localhost:\d+)/);
      if (match) resolve(match[1]);
    });
    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });
    serve.on("exit", reject);
  });
  return simpleProxy(await host);
}

export async function ɵcodegenPublicDirectory(
  sourceDir: string,
  destDir: string,
  configuration: string,
) {
  const { outputPath, baseHref, defaultLocale, locales } = await getBrowserConfig(
    sourceDir,
    configuration,
  );
  await mkdir(join(destDir, baseHref), { recursive: true });
  if (locales) {
    await Promise.all([
      defaultLocale
        ? await copy(join(sourceDir, outputPath, defaultLocale), join(destDir, baseHref))
        : Promise.resolve(),
      ...locales.map(async (locale) => {
        await mkdir(join(destDir, I18N_ROOT, locale, baseHref), { recursive: true });
        await copy(join(sourceDir, outputPath, locale), join(destDir, I18N_ROOT, locale, baseHref));
      }),
    ]);
  } else {
    await copy(join(sourceDir, outputPath), join(destDir, baseHref));
  }
}

export async function getValidBuildTargets(purpose: BUILD_TARGET_PURPOSE, dir: string) {
  const validTargetNames = new Set(["development", "production"]);
  try {
    const { workspaceProject, buildTarget, browserTarget, prerenderTarget, serveTarget } =
      await getContext(dir);
    const { target } = ((purpose === "emulate" && serveTarget) ||
      buildTarget ||
      prerenderTarget ||
      browserTarget)!;
    const workspaceTarget = workspaceProject.targets.get(target)!;
    Object.keys(workspaceTarget.configurations || {}).forEach((it) => validTargetNames.add(it));
  } catch (e) {
    // continue
  }
  const allTargets = await getAllTargets(purpose, dir);
  return [...validTargetNames, ...allTargets];
}

export async function shouldUseDevModeHandle(targetOrConfiguration: string, dir: string) {
  const { serveTarget } = await getContext(dir, targetOrConfiguration);
  if (!serveTarget) return false;
  return serveTarget.configuration !== "production";
}

export async function ɵcodegenFunctionsDirectory(
  sourceDir: string,
  destDir: string,
  configuration: string,
) {
  const {
    packageJson,
    serverOutputPath,
    browserOutputPath,
    defaultLocale,
    serverLocales,
    browserLocales,
    bundleDependencies,
    externalDependencies,
    baseHref,
    serveOptimizedImages,
    serverEntry,
  } = await getServerConfig(sourceDir, configuration);

  const dotEnv = { __NG_BROWSER_OUTPUT_PATH__: browserOutputPath };
  let rewriteSource: string | undefined = undefined;

  await Promise.all([
    serverOutputPath
      ? mkdir(join(destDir, serverOutputPath), { recursive: true }).then(() =>
          copy(join(sourceDir, serverOutputPath), join(destDir, serverOutputPath)),
        )
      : Promise.resolve(),
    mkdir(join(destDir, browserOutputPath), { recursive: true }).then(() =>
      copy(join(sourceDir, browserOutputPath), join(destDir, browserOutputPath)),
    ),
  ]);

  if (bundleDependencies) {
    const dependencies: Record<string, string> = {};
    for (const externalDependency of externalDependencies) {
      const packageVersion = findDependency(externalDependency)?.version;
      if (packageVersion) {
        dependencies[externalDependency] = packageVersion;
      }
    }
    packageJson.dependencies = dependencies;
  } else if (serverOutputPath) {
    packageJson.dependencies ||= {};
  } else {
    packageJson.dependencies = {};
  }

  if (serveOptimizedImages) {
    packageJson.dependencies["sharp"] ||= SHARP_VERSION;
  }

  let bootstrapScript: string;
  if (browserLocales) {
    const locales = serverLocales?.filter((it) => browserLocales.includes(it));
    bootstrapScript = `const localizedApps = new Map();
const ffi18n = import("firebase-frameworks/i18n");
exports.handle = function(req,res) {
  ffi18n.then(({ getPreferredLocale }) => {
    const locale = ${
      locales
        ? `getPreferredLocale(req, ${JSON.stringify(locales)}, ${JSON.stringify(defaultLocale)})`
        : `""`
    };
    if (localizedApps.has(locale)) {
      localizedApps.get(locale)(req,res);
    } else {
      ${
        serverEntry?.endsWith(".mjs")
          ? `import(\`./${serverOutputPath}/\${locale}/${serverEntry}\`)`
          : `Promise.resolve(require(\`./${serverOutputPath}/\${locale}/${serverEntry}\`))`
      }.then(server => {
        const app = server.app(locale);
        localizedApps.set(locale, app);
        app(req,res);
      });
    }
  });
};\n`;
  } else if (serverOutputPath) {
    bootstrapScript = `const app = ${
      serverEntry?.endsWith(".mjs")
        ? `import(\`./${serverOutputPath}/${serverEntry}\`)`
        : `Promise.resolve(require('./${serverOutputPath}/${serverEntry}'))`
    }.then(server => server.app());
exports.handle = (req,res) => app.then(it => it(req,res));\n`;
  } else {
    bootstrapScript = `exports.handle = (res, req) => req.sendStatus(404);\n`;
    rewriteSource = posix.join(baseHref, "__image__");
  }

  return { bootstrapScript, packageJson, dotEnv, rewriteSource };
}
