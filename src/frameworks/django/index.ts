import { copy, mkdirp, pathExists } from "fs-extra";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "../interfaces";
import { dirExistsSync } from "../../fsutils";
import { findPythonCLI, getVenvDir, hasPipDependency, spawnPython } from "../utils";
import { sync as spawnSync } from "cross-spawn";
import { DEFAULT_VENV_DIR } from "../../functions/python";

export const name = "Django";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Framework;

export async function discover(cwd: string) {
  if (!hasPipDependency("Django", { cwd })) return;
  if (!(await pathExists(join(cwd, "manage.py")))) return;
  return { mayWantBackend: true, publicDirectory: "static" };
}

export function build(): Promise<BuildResult> {
  return Promise.resolve({ wantsBackend: true });
}

export async function init(setup: any, config: any) {
  const cwd = join(config.projectDir, setup.hosting.source);
  await mkdirp(cwd);
  const cli = findPythonCLI();
  spawnSync(cli, ["-m", "venv", DEFAULT_VENV_DIR], { stdio: "ignore", cwd });
  writeFile(join(cwd, "requirements.txt"), "Django");
  await spawnPython("pip", ["install", "-r", "requirements.txt"], cwd);
  await spawnPython(
    "django-admin",
    ["startproject", setup.projectId.replaceAll("-", "_"), "."],
    cwd
  );
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const output = await spawnPython(
    "python",
    [
      "manage.py",
      "shell",
      "--no-startup",
      "-c",
      '"import django;print(django.conf.settings.STATIC_URL);print(django.conf.settings.STATIC_ROOT);print(django.conf.settings.STATICFILES_DIRS);"',
    ],
    root
  );
  // TODO parse STATICFILES_DIRS
  const [staticUrl, staticRootOrNone] = output.split("\n");
  // TODO do better than just handle string "None"
  const staticRoot = join(root, staticRootOrNone === "None" ? "static" : staticRootOrNone);
  const staticDest = join(dest, staticUrl);
  await mkdirp(staticDest);
  if (dirExistsSync(staticRoot)) {
    await copy(staticRoot, staticDest);
  }
}

export async function ɵcodegenFunctionsDirectory(root: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const wsgiApplication = await spawnPython(
    "python",
    [
      "manage.py",
      "shell",
      "--no-startup",
      "-c",
      '"import django;print(django.conf.settings.WSGI_APPLICATION);"',
    ],
    root
  );
  const splitWsgiApplication = wsgiApplication.split(".");
  // TODO refactor to at(-1) when we have it
  const imports: [string, string] = [
    splitWsgiApplication.slice(0, -1).join("."),
    splitWsgiApplication.slice(-1)[0],
  ];
  const requirementsTxt = (await readFile(join(root, "requirements.txt"))).toString();
  // COPY everything except venv and .firebase
  const files = await readdir(root);
  const venvDir = getVenvDir(root, files);
  await Promise.all(
    files.map(async (file) => {
      if (file !== venvDir && file !== ".firebase") {
        await copy(join(root, file), join(dest, file), { recursive: true });
      }
    })
  );
  return { imports, requirementsTxt };
}
