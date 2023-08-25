import { copy, mkdirp } from "fs-extra";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { join, relative } from "path";
import {
  BuildResult,
  CodegenFunctionsDirectoryOptions,
  DiscoverOptions,
  FrameworkType,
  SupportLevel,
} from "../interfaces";
import { dirExistsSync } from "../../fsutils";
import { findPythonCLI, getVenvDir, hasPipDependency, spawnPython } from "../utils";
import { sync as spawnSync } from "cross-spawn";
import { DEFAULT_VENV_DIR } from "../../functions/python";
import { logger } from "../../logger";
import { promptOnce } from "../../prompt";
import { HostingBase } from "../../firebaseConfig";

export const name = "Flask";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Framework;

export async function discover(cwd: string, options?: DiscoverOptions) {
  const { flaskConfig } = options || {};

  if (!hasPipDependency("Flask", { cwd })) return;
  // if (flaskConfig) {
  const results = await getDiscoveryResults(cwd, flaskConfig).catch(() => undefined);
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
  const entryFile = results.entryFile;
  return { mayWantBackend: true, publicDirectory, entryFile };
  // }
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

export async function ɵcodegenPublicDirectory(
  root: string,
  options?: CodegenFunctionsDirectoryOptions
) {
  const { dest, frameworksBackend } = options || {};
  if (!dest) throw new Error("Missing dest in options");

  const { staticFolder, staticUrlPath } = await getDiscoveryResults(root, frameworksBackend?.flask);
  const staticDest = join(dest, staticUrlPath);
  await mkdirp(staticDest);
  if (dirExistsSync(staticFolder)) {
    await copy(staticFolder, staticDest);
  }
}

export async function ɵcodegenFunctionsDirectory(
  root: string,
  options?: CodegenFunctionsDirectoryOptions
) {
  const { dest, frameworksBackend } = options || {};
  if (!dest) throw new Error("Missing dest in options");

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
  const { appName } = await getDiscoveryResults(root, frameworksBackend?.flask);
  const imports: [string, string] = [
    `src.${frameworksBackend?.flask.entryFile?.split(".")[0]}`,
    appName,
  ];
  return { imports, requirementsTxt };
}

async function getDiscoveryResults(
  cwd: string,
  flaskConfig?: NonNullable<HostingBase["frameworksBackend"]>["flask"]
) {
  console.log("flaskConfig", flaskConfig);

  let entryFile = flaskConfig?.entryFile;
  if (!entryFile) {
    entryFile = await promptOnce({
      name: "entryFile",
      type: "input",
      message:
        "Detected an existing Flask codebase in the current directory. What file in the project root do you want to use as the entry point to your Flask application?",
      default: "main.py",
    });
  }

  const discovery = await spawnPython(
    "python",
    [join(__dirname, "discover.py"), "--entry_file", entryFile],
    cwd
  );
  const [appName, staticFolder, staticUrlPath = "/"] = discovery.split("\n");
  return {
    appName,
    staticFolder,
    staticUrlPath,
    entryFile,
  };
}
