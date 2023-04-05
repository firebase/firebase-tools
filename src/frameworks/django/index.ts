import { copy, pathExists } from "fs-extra";
import { mkdir, readFile, rmdir } from "fs/promises";
import { join } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "..";
import { runWithVirtualEnv } from "../../functions/python";

export const name = "Django";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Framework;

const CLI = 'python3.10';

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "requirements.txt")))) return;
  if (!(await pathExists(join(dir, "manage.py")))) return;
  try {
    // TODO do this better
    // TODO do this better
    const isDjango = await new Promise<string>((resolve) => {
      const child = runWithVirtualEnv(
        [CLI, "manage.py", "shell", "--no-startup", "-c", "\"import django;print(True)\""],
        dir,
        {},
      );
      let out = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        console.log(chunk);
        const chunkString = chunk.toString();
        out = out + chunkString;
      });
      child.on("exit", () => resolve(out));
    });
    console.log({ isDjango });
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
  const wsgiApplication = await new Promise<string>((resolve) => {
    const child = runWithVirtualEnv(
      [CLI, "manage.py", "shell", "--no-startup", "-c", "\"import django;print(django.conf.settings.WSGI_APPLICATION);\""],
      root,
      {},
    );
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const chunkString = chunk.toString();
      out = out + chunkString;
    });
    child.on("exit", () => resolve(out));
  });
  const splitWsgiApplication = wsgiApplication.trim().split(".");
  // TODO refactor to at(-1) when we have it
  const imports = [splitWsgiApplication.slice(0, -1).join("."), splitWsgiApplication.slice(-1)[0]];
  const requirementsTxt = await readFile(join(root, "requirements.txt"));
  await copy(root, dest, { recursive: true });
  return { imports, requirementsTxt };
}
