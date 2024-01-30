import { ChildProcess } from "child_process";
import * as spawn from "cross-spawn";

export class CLIProcess {
  process?: ChildProcess;

  constructor(
    private readonly name: string,
    private readonly workdir: string,
  ) {}

  start(
    cmd: string,
    project: string,
    additionalArgs: string[],
    logDoneFn?: (d: unknown) => unknown,
  ): Promise<void> {
    const args = [cmd, "--project", project];

    if (additionalArgs) {
      args.push(...additionalArgs);
    }

    const p = spawn("firebase", args, { cwd: this.workdir });
    if (!p) {
      throw new Error("Failed to start firebase CLI");
    }
    this.process = p;

    this.process.stdout?.on("data", (data: unknown) => {
      process.stdout.write(`[${this.name} stdout] ` + data);
    });

    this.process.stderr?.on("data", (data: unknown) => {
      console.log(`[${this.name} stderr] ` + data);
    });

    let started: Promise<void>;
    if (logDoneFn) {
      started = new Promise((resolve, reject) => {
        const customCallback = (data: unknown): void => {
          if (logDoneFn(data)) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            p.stdout?.removeListener("close", customFailure);
            resolve();
          }
        };
        const customFailure = (): void => {
          p.stdout?.removeListener("data", customCallback);
          reject(new Error("failed to resolve startup before process.stdout closed"));
        };
        p.stdout?.on("data", customCallback);
        p.stdout?.on("close", customFailure);
      });
    } else {
      started = new Promise((resolve) => {
        p.once("close", () => {
          this.process = undefined;
          resolve();
        });
      });
    }

    return started;
  }

  stop(): Promise<void> {
    const p = this.process;
    if (!p) {
      return Promise.resolve();
    }

    const stopped = new Promise<void>((resolve) => {
      p.once("exit", (/* exitCode, signal */) => {
        this.process = undefined;
        resolve();
      });
    }).then(() => undefined); // Fixes return type.

    p.kill("SIGINT");
    return stopped;
  }
}
