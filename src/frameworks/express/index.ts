import { execSync } from "child_process";
import { copy, pathExists } from "fs-extra";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "../interfaces";

// Use "true &&"" to keep typescript from compiling this file and rewriting
// the import statement into a require
const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "Express.js";
export const support = SupportLevel.Preview;
export const type = FrameworkType.Custom;
export const docsUrl = "https://firebase.google.com/docs/hosting/frameworks/express";

async function getConfig(root: string) {
  const packageJsonBuffer = await readFile(join(root, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  const serve: string | undefined = packageJson.directories?.serve;
  const serveDir = serve && join(root, packageJson.directories?.serve);
  return { serveDir, packageJson };
}

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "package.json")))) return;
  const { serveDir: publicDirectory } = await getConfig(dir);
  if (!publicDirectory) return;
  return { mayWantBackend: true, publicDirectory };
}

export async function build(cwd: string): Promise<BuildResult> {
  execSync(`npm run build`, { stdio: "inherit", cwd });
  const wantsBackend = !!(await getBootstrapScript(cwd));
  return { wantsBackend };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const { serveDir } = await getConfig(root);
  await copy(serveDir!, dest);
}

async function getBootstrapScript(
  root: string,
  _bootstrapScript = "",
  _entry?: any,
): Promise<string | undefined> {
  let entry = _entry;
  let bootstrapScript = _bootstrapScript;
  const allowRecursion = !entry;
  if (!entry) {
    const {
      packageJson: { name },
    } = await getConfig(root);
    try {
      entry = require(root);
      bootstrapScript = `const bootstrap = Promise.resolve(require('${name}'))`;
    } catch (e) {
      entry = await dynamicImport(root).catch(() => undefined);
      bootstrapScript = `const bootstrap = import('${name}')`;
    }
  }
  if (!entry) return undefined;
  const { default: defaultExport, app, handle } = entry;
  if (typeof handle === "function") {
    return (
      bootstrapScript +
      ";\nexports.handle = async (req, res) => (await bootstrap).handle(req, res);"
    );
  }
  if (typeof app === "function") {
    try {
      const express = app();
      if (typeof express.render === "function") {
        return (
          bootstrapScript +
          ";\nexports.handle = async (req, res) => (await bootstrap).app(req, res);"
        );
      }
    } catch (e) {
      // continue, failure here is expected
    }
  }
  if (!allowRecursion) return undefined;
  if (typeof defaultExport === "object") {
    bootstrapScript += ".then(({ default }) => default)";
    if (typeof defaultExport.then === "function") {
      const awaitedDefaultExport = await defaultExport;
      return getBootstrapScript(root, bootstrapScript, awaitedDefaultExport);
    } else {
      return getBootstrapScript(root, bootstrapScript, defaultExport);
    }
  }
  return undefined;
}

export async function ɵcodegenFunctionsDirectory(root: string, dest: string) {
  const bootstrapScript = await getBootstrapScript(root);
  if (!bootstrapScript) throw new Error("Cloud not find bootstrapScript");
  await mkdir(dest, { recursive: true });

  const { packageJson } = await getConfig(root);

  const packResults = execSync(`npm pack ${root} --json`, { cwd: dest });
  const npmPackResults = JSON.parse(packResults.toString());
  const matchingPackResult = npmPackResults.find((it: any) => it.name === packageJson.name);
  const { filename } = matchingPackResult;
  packageJson.dependencies ||= {};
  packageJson.dependencies[packageJson.name] = `file:${filename}`;
  return { bootstrapScript, packageJson };
}
