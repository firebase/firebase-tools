import { ChildProcess, execSync } from "child_process";
import * as spawn from "cross-spawn";

// Allow up to 10 seconds for graceful CLI and emulator shutdown (export-on-exit + 4000ms JVM kill timeout).
const SHUTDOWN_TIMEOUT_MS = 10000;
// Wait up to 2 seconds for Windows taskkill /T /F process-tree termination.
const WINDOWS_KILL_TIMEOUT_MS = 2000;

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
      detached: process.platform !== "win32",
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
    this.process = undefined;

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
        timeoutId = setTimeout(resolve, WINDOWS_KILL_TIMEOUT_MS);
      });

      try {
        execSync(`taskkill /pid ${p.pid} /T /F`);
      } catch {
        // ignore if process already exited
      }

      return Promise.race([exitPromise, timeoutPromise]).then(() => {
        clearTimeout(timeoutId);
      });
    }

    const pid = p.pid;
    if (!pid || pid <= 0) {
      return Promise.resolve();
    }

    if (p.exitCode !== null || p.signalCode !== null) {
      return Promise.resolve();
    }

    const killProcessTree = (sig: NodeJS.Signals): void => {
      try {
        const children = execSync(`ps -o pid= --ppid ${pid}`, { stdio: ["pipe", "pipe", "ignore"] })
          .toString()
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(Number);
        for (const childPid of children) {
          try {
            process.kill(-childPid, sig);
          } catch {
            try {
              process.kill(childPid, sig);
            } catch {
              // Child already exited.
            }
          }
        }
      } catch {
        // No child processes found.
      }
      try {
        process.kill(-pid, sig);
      } catch {
        try {
          p.kill(sig);
        } catch {
          // Process already exited.
        }
      }
    };

    const exitPromise = new Promise<void>((resolve) => {
      p.once("exit", () => {
        resolve();
      });
    });

    const timeoutId = setTimeout(() => {
      killProcessTree("SIGKILL");
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      p.kill("SIGINT");
    } catch {
      // Process already exited.
    }

    return exitPromise.then(() => {
      clearTimeout(timeoutId);
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Process group already exited.
      }
    });
  }
}
