import { copy, pathExists } from "fs-extra";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "..";
import { runWithVirtualEnv } from "../../deploy/functions/runtimes/python";

export const name = "Django";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Framework;

const CLI = 'python3.10';

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "requirements.txt")))) return;
  if (!(await pathExists(join(dir, "manage.py")))) return;
  try {
    // TODO do this better
    const isDjango = await runWithVirtualEnv(
        [CLI, "manage.py", "shell", "--no-startup", "-c", "\"import django;print(True)\""], dir
    ).promise;
    if (isDjango !== "True\n") return;
    return { mayWantBackend: true };
  } catch(e) {
    // continue
  }
}

export async function build(cwd: string): Promise<BuildResult> {
  return { wantsBackend: true };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
}

export async function ɵcodegenFunctionsDirectory(root: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const wsgiApplication = await runWithVirtualEnv(
    [CLI, "manage.py", "shell", "--no-startup", "-c", "\"import django;print(django.conf.settings.WSGI_APPLICATION);\""],
    root
  ).promise;
  const splitWsgiApplication = wsgiApplication.trim().split(".");
  // TODO refactor to at(-1) when we have it
  const imports = [splitWsgiApplication.slice(0, -1).join("."), splitWsgiApplication.slice(-1)[0]];
  const requirementsTxt = await readFile(join(root, "requirements.txt"));
  await copy(root, dest, { recursive: true });
  return { imports, requirementsTxt };
}
