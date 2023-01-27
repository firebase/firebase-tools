import { copy, pathExists, rename } from "fs-extra";
import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "..";
import { runWithVirtualEnv } from "../../functions/python";

export const name = "Flask";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Framework;

const CLI = 'python3.10';

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "requirements.txt")))) return;
  if (!(await pathExists(join(dir, "main.py")))) return;
  try {
    // TODO do this better
    const discovery = await new Promise<string>((resolve) => {
      const child = runWithVirtualEnv(
        [CLI, join(__dirname, 'discover.py')],
        dir,
        {},
      );
      let out = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        const chunkString = chunk.toString();
        out = out + chunkString;
      });
      child.on("exit", () => resolve(out));
    });
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
  const discovery = await new Promise<string>((resolve) => {
    const child = runWithVirtualEnv(
      [CLI, join(__dirname, 'discover.py')],
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
  const imports = ['src.main', discovery.split("\n")[0]];
  return { imports, requirementsTxt };
}
