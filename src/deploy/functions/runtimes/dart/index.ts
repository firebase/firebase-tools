import * as path from "path";
import * as fs from "fs";
import * as spawn from "cross-spawn";

import * as runtimes from "..";
import { logger } from "../../../../logger";
import * as discovery from "../discovery";
import { FirebaseError } from "../../../../error";
import { Build } from "../../build";
import { ChildProcess, ProcessEnvOptions } from "child_process";

class Delegate implements runtimes.RuntimeDelegate {
  public readonly name = "python";
  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime
  ) {}

  validate(): Promise<void> {
    return Promise.resolve();
  }

  // Watch isn't supported for Dart.
  watch(): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  async build(): Promise<void> {
    // No-op.
  }

  serve(port: string, env: Record<string, string | undefined>): ChildProcess {
    const command = "dart";
    const args = ["run", ":server"];

    const childProcess = spawn(command, args, {
      env: { ...env, PORT: port } as unknown as ProcessEnvOptions["env"],
      cwd: this.sourceDir,
      stdio: [/* stdin=*/ "pipe", /* stdout=*/ "pipe", /* stderr=*/ "pipe", "ipc"],
    });
    childProcess.stdout?.on("data", (chunk) => {
      logger.debug(chunk.toString());
    });
    childProcess.stderr?.on("data", (chunk) => {
      logger.debug(chunk.toString());
    });
    return childProcess;
  }

  async discoverBuild(): Promise<Build> {
    const discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
    if (!discovered) {
      throw new FirebaseError("Dart functions must include functions.yaml.");
    }
    return discovered;
  }
}

/**
 * This function is used to create a runtime delegate for the Python runtime.
 * @param context runtimes.DelegateContext
 * @return Delegate Python runtime delegate
 */
export async function tryCreateDelegate(
  context: runtimes.DelegateContext
): Promise<Delegate | undefined> {
  const pubspecPath = path.join(context.sourceDir, "pubspec.yaml");
  if (!fs.existsSync(pubspecPath)) {
    logger.debug("Customer code is not Dart code.");
    return;
  }
  return Promise.resolve(new Delegate(context.projectId, context.sourceDir, "dart"));
}
