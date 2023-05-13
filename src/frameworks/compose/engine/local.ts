import * as spawn from "cross-spawn";

import { AppSpec, Engine } from "../interfaces";

export class LocalEngine implements Engine {
  constructor(readonly spec: AppSpec) {}

  private execCmd(cmdStr: string) {
    const [cmd, ...args] = cmdStr.split(" ");
    const ret = spawn.sync(cmd, args, {
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
}
