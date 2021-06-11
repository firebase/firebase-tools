import * as spawn from "cross-spawn";
import * as path from "path";
import { ChildProcess } from "child_process";
import * as fs from "fs";
import { promisify } from "util";

import { Options} from "../../../../options"
import * as runtimes from ".."
import * as args from "../../args"
import * as backend from "../../backend";
import { FirebaseError } from "../../../../error";

export const LATEST_VERSION: runtimes.Runtime = "python39";
export const PYENV = "py3"

export function run(command: string, functionsDir: string, opts?: Record<string, unknown>): ChildProcess & { exit(): Promise<void> } {
  const child = spawn("source", [path.join(functionsDir, PYENV, "bin", "activate"), "&&", ...command.split(" ")], {
    shell: true,
    cwd: functionsDir,
    stdio: "inherit",
    ...opts,
  });
  (child as any).exit = () => {
    return new Promise((resolve, reject) => {
      child.on("exit", resolve);
      child.on("error", reject);
    });
  }
  return child as ChildProcess & { exit(): Promise<void> };
}

export function tryCreateDelegate(context: args.Context, options: Options): Promise<Delegate | undefined> {
  const sourceDirName = options.config.get("functions.source");
  const sourceDir = options.config.path(sourceDirName);

  const runtime = options.config.get("functions.runtime") as string;
  if (!runtime) {
    return Promise.resolve(undefined);
  }
  if (!runtime.startsWith("python")) {
    return Promise.resolve(undefined);
  }

  if (!runtimes.isValidRuntime(runtime)) {
    throw new FirebaseError(`Runtime ${runtime} is not a valid Python runtime`);
  }

  return Promise.resolve(new Delegate(sourceDir, runtime));
}

class Delegate {
  readonly name = "python";

  constructor(private readonly sourceDir: string, public readonly runtime: runtimes.Runtime) {}

  private modulesDir_: string = "";
  async modulesDir(): Promise<string> {
    if (!this.modulesDir_) {
      const child = run("python -c 'import firebase_functions; import os; print(os.path.dirname(firebase_functions.__file__))'", this.sourceDir, {
        stdio: [
          /* stdin= */ "ignore",
          /* stdout= */ "pipe",
          /* stderr= */ "inherit",
        ],
      });

      let out = "";
      child.stdout.on("data", (chunk) => {
        console.log("Got chunk", chunk);
        out = out + chunk;
      });
      await child.exit();
      this.modulesDir_ = out;
      console.log("Got modules dir", out);
    }

    return this.modulesDir_;
  }

  validate(): Promise<void> {
    return Promise.resolve();
  }

  async build(): Promise<void> {
    const codegen = path.join(await this.modulesDir(), "codegen.py");
    const functions = path.join(this.sourceDir, "functions.py");
    const child = run(`python ${codegen} ${functions}`, this.sourceDir, {
      stdio: [
        /* stdin= */"ignore",
        /* stdout= */"pipe",
        /* stderr= */"inherit",
      ],
    });
    await child.exit();
    const program = child.stdout.toString();
    console.log("Generated program", program);
    await promisify(fs.writeFile)(path.join(this.sourceDir, "app.py"), program);
  }

  watch(): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  serve(
    port: number,
    adminPort: number,
    envs: backend.EnvironmentVariables,
  ): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  async discoverSpec(
    configValues: backend.RuntimeConfigValues,
    envs: backend.EnvironmentVariables,
  ): Promise<backend.Backend> {
    throw new FirebaseError("TODO");
  }
}