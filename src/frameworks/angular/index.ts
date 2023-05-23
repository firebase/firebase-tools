import { join, posix } from "path";
import { execSync } from "child_process";
import { spawn, sync as spawnSync } from "cross-spawn";
import { copy, pathExists } from "fs-extra";
import { mkdir } from "fs/promises";

import { BuildResult, Discovery, FrameworkType, SupportLevel } from "../interfaces";
import { promptOnce } from "../../prompt";
import {
  simpleProxy,
  relativeRequire,
  getNodeModuleBin,
  warnIfCustomBuildScript,
  findDependency,
} from "../utils";
import { getBrowserConfig, getBuildConfig, getContext, getServerConfig } from "./utils";
import { I18N_ROOT, SHARP_VERSION } from "../constants";
import { FirebaseError } from "../../error";

export const name = "Angular";
export const support = SupportLevel.Preview;
export const type = FrameworkType.Framework;
export const docsUrl = "https://firebase.google.com/docs/hosting/frameworks/angular";

const DEFAULT_BUILD_SCRIPT = ["ng build"];

export async function discover(dir: string): Promise<Discovery | undefined> {
  if (!(await pathExists(join(dir, "package.json")))) return;
  if (!(await pathExists(join(dir, "angular.json")))) return;
  return { mayWantBackend: true, publicDirectory: join(dir, "src", "assets") };
}

export async function init(setup: any, config: any) {
  execSync(
    `npx --yes -p @angular/cli@latest ng new ${setup.projectId} --directory ${setup.hosting.source} --skip-git`,
    {
      stdio: "inherit",
      cwd: config.projectDir,
    }
  );
  const useAngularUniversal = await promptOnce({
    name: "useAngularUniversal",
    type: "confirm",
    default: false,
    message: `Would you like to setup Angular Universal?`,
  });
  if (useAngularUniversal) {
    execSync("ng add @nguniversal/express-engine --skip-confirmation", {
      stdio: "inherit",
      cwd: join(config.projectDir, setup.hosting.source),
    });
  }
}

export async function build(dir: string): Promise<BuildResult> {
  const { targets, serverTarget, serveOptimizedImages, locales, baseHref } = await getBuildConfig(
    dir
  );
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

  const wantsBackend = !!serverTarget || serveOptimizedImages;
  const rewrites = serverTarget
    ? []
    : [
        {
          source: posix.join(baseHref, "**"),
          destination: posix.join(baseHref, "index.html"),
        },
      ];
  const i18n = !!locales;
  return { wantsBackend, i18n, rewrites };
}

export async function getDevModeHandle(dir: string) {
  const { targetStringFromTarget } = relativeRequire(dir, "@angular-devkit/architect");
  const { serveTarget } = await getContext(dir);
  if (!serveTarget) throw new Error("Could not find the serveTarget");
  const host = new Promise<string>((resolve) => {
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
  });
  return simpleProxy(await host);
}

export async function ɵcodegenPublicDirectory(sourceDir: string, destDir: string) {
  const { outputPath, baseHref, defaultLocale, locales } = await getBrowserConfig(sourceDir);
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

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const {
    packageJson,
    serverOutputPath,
    browserOutputPath,
    defaultLocale,
    serverLocales,
    browserLocales,
    bundleDependencies,
    externalDependencies,
    baseHref: baseUrl,
    serveOptimizedImages,
  } = await getServerConfig(sourceDir);

  const dotEnv = { __NG_BROWSER_OUTPUT_PATH__: browserOutputPath };
  let rewriteSource: string | undefined = undefined;

  await Promise.all([
    serverOutputPath
      ? mkdir(join(destDir, serverOutputPath), { recursive: true }).then(() =>
          copy(join(sourceDir, serverOutputPath), join(destDir, serverOutputPath))
        )
      : Promise.resolve(),
    mkdir(join(destDir, browserOutputPath), { recursive: true }).then(() =>
      copy(join(sourceDir, browserOutputPath), join(destDir, browserOutputPath))
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
      const app = require(\`./${serverOutputPath}/\${locale}/main.js\`).app(locale);
      localizedApps.set(locale, app);
      app(req,res);
    }
  });
};\n`;
  } else if (serverOutputPath) {
    bootstrapScript = `exports.handle = require('./${serverOutputPath}/main.js').app();\n`;
  } else {
    bootstrapScript = `exports.handle = (res, req) => req.sendStatus(404);\n`;
    rewriteSource = posix.join(baseUrl, "__image__");
  }

  return { bootstrapScript, packageJson, baseUrl, dotEnv, rewriteSource };
}
