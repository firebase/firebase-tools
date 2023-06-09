import { copy, pathExists } from "fs-extra";
import { mkdir, readFile, readdir } from "fs/promises";
import { join } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "../interfaces";
import { runWithVirtualEnv } from "../../functions/python";

export const name = "Django";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Framework;

const CLI = "python";

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "requirements.txt")))) return;
  if (!(await pathExists(join(dir, "manage.py")))) return;
  try {
    // TODO do this better
    // TODO do this better
    const isDjango = await new Promise<string>((resolve) => {
      const child = runWithVirtualEnv(
        [CLI, "manage.py", "shell", "--no-startup", "-c", '"import django;print(True)"'],
        dir,
        {}
      );
      let out = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        const chunkString = chunk.toString();
        out = out + chunkString;
      });
      child.on("exit", () => resolve(out));
    });
    if (isDjango !== "True\n") return;
    // TODO don't hardcode static
    return { mayWantBackend: true, publicDirectory: "static" };
  } catch (e) {
    // continue
  }
}

export function build(): Promise<BuildResult> {
  return Promise.resolve({ wantsBackend: true });
}

export function ɵcodegenPublicDirectory() {
  return Promise.resolve();
  // TODO copy over the STATIC_DIRS
}

export async function ɵcodegenFunctionsDirectory(root: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const wsgiApplication = await new Promise<string>((resolve) => {
    const child = runWithVirtualEnv(
      [
        CLI,
        "manage.py",
        "shell",
        "--no-startup",
        "-c",
        '"import django;print(django.conf.settings.WSGI_APPLICATION);"',
      ],
      root,
      {}
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
  const imports: [string,string] = [splitWsgiApplication.slice(0, -1).join("."), splitWsgiApplication.slice(-1)[0]];
  const requirementsTxt = (await readFile(join(root, "requirements.txt"))).toString();
  // COPY everything except venv
  const files = await readdir(root);
  await Promise.all(files.map(async file => {
    if (file !== "venv") {
      await copy(join(root, file), join(dest, file), { recursive: true });
    }
  }));
  return { imports, requirementsTxt };
}
