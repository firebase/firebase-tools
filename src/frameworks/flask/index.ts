import { copy, mkdirp } from "fs-extra";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { join, relative } from "path";
import { BuildResult, FrameworkType, SupportLevel } from "../interfaces";
import { dirExistsSync } from "../../fsutils";
import { findPythonCLI, getVenvDir, hasPipDependency, spawnPython } from "../utils";
import { sync as spawnSync } from "cross-spawn";
import { DEFAULT_VENV_DIR } from "../../functions/python";
import { logger } from "../../logger";

export const name = "Flask";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Framework;

export async function discover(cwd: string) {
  if (!hasPipDependency("Flask", { cwd })) return;
  const results = await getDiscoveryResults(cwd).catch(() => undefined);
  if (!results) {
    logger.debug(
      "Looks like you might be using Flask. Here are some tips on using our tools with your Python project:"
    );
    logger.debug(
      '\t1. You have your app entry point in a "main.py" file in the hosting root folder.'
    );
    logger.debug(
      '\t2. You have created and activated a virtual environment "python -m venv venv && . venv/bin/activate"'
    );
    logger.debug(
      '\t3. You have run "pip install -t requirements.txt" at least once and are able to start a standalone Flask server'
    );

    return;
  }
  const publicDirectory = relative(cwd, results.staticFolder);
  return { mayWantBackend: true, publicDirectory };
}

export async function init(setup: any, config: any) {
  const cwd = join(config.projectDir, setup.hosting.source);
  await mkdirp(cwd);
  const cli = findPythonCLI();
  spawnSync(cli, ["-m", "venv", DEFAULT_VENV_DIR], { stdio: "ignore", cwd });
  writeFile(join(cwd, "requirements.txt"), "Flask");
  await spawnPython("pip", ["install", "-r", "requirements.txt"], cwd);
  await writeFile(
    join(cwd, "main.py"),
    `from flask import Flask

app = Flask(__name__)

@app.route("/")
def hello_world():
    return "<p>Hello, World!</p>"
`
  );
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
  // COPY everything except venv and .firebase
  const files = await readdir(root);
  const venvDir = getVenvDir(root, files);
  await Promise.all(
    files.map(async (file) => {
      if (file !== venvDir && file !== ".firebase") {
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
  const discovery = await spawnPython("python", [join(__dirname, "discover.py")], cwd);
  const [appName, staticFolder, staticUrlPath = "/"] = discovery.split("\n");
  return {
    appName,
    staticFolder,
    staticUrlPath,
  };
}
