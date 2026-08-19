import { ChildProcess, execSync } from "child_process";
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
    env?: Record<string, string>,
  ): Promise<void> {
    const args = [cmd, "--project", project];

    if (additionalArgs) {
      args.push(...additionalArgs);
    }

    const p = spawn("firebase", args, {
      cwd: this.workdir,
      env: env ? { ...process.env, ...env } : process.env,
    });
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
        p.stderr?.on("data", (data) => {
          console.error(`[${this.name} stderr]`, data.toString());
        });
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

    if (process.platform === "win32" && p.pid) {
      const exitPromise = new Promise<void>((resolve) => {
        if (p.exitCode !== null || p.signalCode !== null) {
          resolve();
          return;
        }
        p.once("exit", () => resolve());
      });

      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, 2000);
      });

      try {
        execSync(`taskkill /pid ${p.pid} /T /F`);
      } catch {
        // ignore if process already exited
      }

      return Promise.race([exitPromise, timeoutPromise]).then(() => {
        clearTimeout(timeoutId);
        this.process = undefined;
      });
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
