import * as fs from "node:fs";
import * as spawn from "cross-spawn";

import { AppBundle, Hook, Driver } from "../interfaces";
import { BUNDLE_PATH, genHookScript } from "./hooks";
import { RuntimeSpec } from "../discover/types";

export class LocalDriver implements Driver {
  constructor(readonly spec: RuntimeSpec) {}

  private execCmd(cmd: string, args: string[]) {
    const ret = spawn.sync(cmd, args, {
      env: { ...process.env, ...this.spec.environmentVariables },
      stdio: [/* stdin= */ "pipe", /* stdout= */ "inherit", /* stderr= */ "inherit"],
    });
    if (ret.error) {
      throw ret.error;
    }
  }

  install(): void {
    if (this.spec.installCommand) {
      if (this.spec.packageManagerInstallCommand) {
        const [cmd, ...args] = this.spec.packageManagerInstallCommand.split(" ");
        this.execCmd(cmd, args);
      }
      const [cmd, ...args] = this.spec.installCommand.split(" ");
      this.execCmd(cmd, args);
    }
  }

  build(): void {
    if (this.spec.detectedCommands?.build) {
      const [cmd, ...args] = this.spec.detectedCommands.build.cmd.split(" ");
      this.execCmd(cmd, args);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export(bundle: AppBundle): void {
    // no-op
  }

  execHook(bundle: AppBundle, hook: Hook): AppBundle {
    const script = genHookScript(bundle, hook);
    this.execCmd("node", ["-e", script]);
    if (!fs.existsSync(BUNDLE_PATH)) {
      console.warn(`Expected hook to generate app bundle at ${BUNDLE_PATH} but got nothing.`);
      console.warn("Returning original bundle.");
      return bundle;
    }
    const newBundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, "utf8"));
    return newBundle as AppBundle;
  }
}
