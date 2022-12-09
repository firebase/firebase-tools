import { execSync } from "child_process";
import { copy, pathExists, rename } from "fs-extra";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "..";
import { runWithVirtualEnv } from "../../deploy/functions/runtimes/python";

export const name = "WSGI";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;

const CLI = 'python3.10';

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "requirements.txt")))) return;
  if (!(await pathExists(join(dir, "main.py")))) return;
  try {
    // TODO do this better
    const discovery = await runWithVirtualEnv(
        [CLI, join(__dirname, 'discover.py')], dir
    ).promise;
    console.log('wsgi', { discovery });
    if (!discovery.trim()) return;
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
  await mkdir(join(dest, 'src'), { recursive: true });
  await copy(root, join(dest, 'src'), { recursive: true });
  await rename(join(dest, 'src', 'venv'), join(dest, 'venv'));
  const requirementsTxt = await readFile(join(root, "requirements.txt"));
  const discovery = await runWithVirtualEnv(
    [CLI, join(__dirname, 'discover.py')], root
  ).promise;
  const imports = ['src.main', discovery.split("\n")[0]];
  return { imports, requirementsTxt };
}
