import * as fs from "node:fs";
import * as spawn from "cross-spawn";

import { AppBundle, AppSpec, Hook, Driver } from "../interfaces";
import { BUNDLE_PATH, genHookScript } from "./hooks";

export class LocalDriver implements Driver {
  constructor(readonly spec: AppSpec) {}

  private execCmd(cmdStr: string) {
    const [cmd, ...args] = cmdStr.split(" ");
    const ret = spawn.sync(cmd, args, {
      env: { ...process.env, ...this.spec.environmentVariables },
      stdio: [/* stdin= */ "pipe", /* stdout= */ "inherit", /* stderr= */ "inherit"],
    });
    if (ret.error) {
      throw ret.error;
    }
  }

  install(): void {
    this.execCmd(this.spec.installCommand);
  }

  build(): void {
    this.execCmd(this.spec.buildCommand);
  }
  execHook(bundle: AppBundle, hook: Hook): AppBundle {
    const script = genHookScript(bundle, hook);
    const ret = spawn.sync("node", ["-e", script], {
      env: { ...process.env, ...this.spec.environmentVariables },
      stdio: [/* stdin= */ "pipe", /* stdout= */ "inherit", /* stderr= */ "inherit"],
    });
    if (ret.error) {
      throw ret.error;
    }
    if (!fs.existsSync(BUNDLE_PATH)) {
      console.warn(`Expected hook to generate app bundle at ${BUNDLE_PATH} but got nothing.`);
      console.warn("Returning original bundle.");
      return bundle;
    }
    const newBundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, "utf8"));
    return newBundle as AppBundle;
  }
}
