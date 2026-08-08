import { expect } from "chai";
import { spawn } from "child_process";
import * as path from "path";

describe("downloadableEmulators integration constraints", () => {
  it("should forcefully kill detached java emulators when the CLI process abruptly dies", (done) => {
    // This script bootstraps a detached emulator instance internally and simulates a crashing runtime
    // to prove that process.on("exit") OS hooks behave properly.
    const script = `
      const { start, get } = require("./lib/emulator/downloadableEmulators");
      const { Emulators } = require("./lib/emulator/types");
      
      start(Emulators.DATABASE, { port: 9006, host: "127.0.0.1", auto_download: true })
        .then(() => {
          const details = get(Emulators.DATABASE);
          console.log("JAVA_PID=" + details.instance.pid);
          // Wait 1000ms to simulate doing arbitrary work, then trigger an uncaught unhandled crash.
          setTimeout(() => {
            process.exit(1);
          }, 1000);
        })
        .catch((err) => {
          console.error("FAILED TO BOOT:", err);
        });
    `;

    const rootPath = __dirname.substring(
      0,
      __dirname.indexOf(path.join("scripts", "emulator-tests")),
    );
    const child = spawn("node", ["-e", script], {
      cwd: rootPath,
    });

    let javaPid = -1;

    // Capture standard output to parse the returned process id integer from the mocked script.
    child.stdout.on("data", (data) => {
      const str = data.toString();
      const match = str.match(/JAVA_PID=(\d+)/);
      if (match) {
        javaPid = parseInt(match[1], 10);
      }
    });

    let stderrLogs = "";
    child.stderr.on("data", (data) => {
      stderrLogs += data.toString();
    });

    child.on("exit", (code) => {
      // We expect the script to have terminated precisely on an exit 1 via process.exit(1)
      expect(code).to.equal(
        1,
        `Expected child process to exit 1 but got code ${code}. Stderr: ${stderrLogs}`,
      );
      expect(javaPid).to.be.greaterThan(
        0,
        `Child process never returned a JAVA_PID! Stderr: ${stderrLogs}`,
      );

      try {
        // Assert native OS PID checks to verify the Java Process doesn't still exist.
        process.kill(javaPid, 0);

        // If we reach here without an ESRCH error, the java process is ALIVE, which is a logic FAILURE.
        // We MUST manually kill it so it doesn't leak out of the test environment.
        process.kill(javaPid, "SIGKILL");
        done(
          new Error("Java process " + javaPid + " was still alive after parent abruptly exited!"),
        );
      } catch (e) {
        // ESRCH directly maps to 'No such process'. This proves our SIGKILL 'on exit' safety net works!
        expect((e as NodeJS.ErrnoException).code).to.equal("ESRCH");
        done();
      }
    });
  }).timeout(20000);
});
