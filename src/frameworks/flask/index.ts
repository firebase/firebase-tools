import { copy, mkdirp, pathExists } from "fs-extra";
import { mkdir, readFile, readdir } from "fs/promises";
import { join, relative } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "../interfaces";
import { runWithVirtualEnv } from "../../functions/python";
import { dirExistsSync } from "../../fsutils";

export const name = "Flask";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Framework;

const CLI = "python";

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "requirements.txt")))) return;
  if (!(await pathExists(join(dir, "main.py")))) return;
  const discovery = await getDiscoveryResults(dir);
  return { mayWantBackend: true, publicDirectory: discovery.staticFolder };
}

export function build(): Promise<BuildResult> {
  return Promise.resolve({ wantsBackend: true });
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const { staticFolder, staticUrlPath } = await getDiscoveryResults(root);
  const staticDest = join(dest, staticUrlPath);
  await mkdirp(staticDest);
  if (dirExistsSync(staticFolder)) {
    await copy(staticFolder, staticDest);
  }
}

export async function ɵcodegenFunctionsDirectory(root: string, dest: string) {
  await mkdir(join(dest, "src"), { recursive: true });
  // COPY everything except venv
  const files = await readdir(root);
  await Promise.all(
    files.map(async (file) => {
      if (file !== "venv") {
        await copy(join(root, file), join(dest, "src", file), { recursive: true });
      }
    })
  );
  const requirementsTxt = (await readFile(join(root, "requirements.txt"))).toString();
  const { appName } = await getDiscoveryResults(root);
  const imports: [string, string] = ["src.main", appName];
  return { imports, requirementsTxt };
}

async function getDiscoveryResults(cwd: string) {
  const discovery = await new Promise<string>((resolve) => {
    const child = runWithVirtualEnv([CLI, join(__dirname, "discover.py")], cwd, {});
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const chunkString = chunk.toString();
      out = out + chunkString;
    });
    child.on("exit", () => resolve(out));
  });
  const [appName, staticFolder, staticUrlPath = "/"] = discovery.trim().split("\n");
  return {
    appName,
    staticFolder,
    staticUrlPath,
  };
}
