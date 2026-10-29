import * as assert from "assert";
import { parseVersionOutput } from "../../../extension";
import { logSetup } from "../../../logger-wrapper";
import { logger } from "../../../../../src/logger";
import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";

const debugBanner = [
  "[2026-10-24T18:16:05.021Z] ----------------------------------------------------------------------",
  "[2026-10-24T18:16:05.022Z] Command:       /usr/local/bin/node /usr/local/bin/firebase --version",
  "[2026-10-24T18:16:05.022Z] CLI Version:   15.33.0",
  "[2026-10-24T18:16:05.022Z] Platform:      win32",
  "[2026-10-24T18:16:05.022Z] Node Version:  v22.14.0",
  "[2026-10-24T18:16:05.022Z] ----------------------------------------------------------------------",
  "",
  "[2026-10-24T18:16:05.030Z] >>> [apiv2][query] GET https://firebase-public.firebaseio.com/cli.json [none]",
];

firebaseSuite("parseVersionOutput", () => {
  firebaseTest("reads a bare version", async () => {
    assert.strictEqual(parseVersionOutput("15.33.0"), "15.33.0");
  });

  firebaseTest("reads the version after the debug banner", async () => {
    const stdout = [...debugBanner, "15.33.0"].join("\n");
    assert.strictEqual(parseVersionOutput(stdout), "15.33.0");
  });

  firebaseTest("reads the version with Windows line endings", async () => {
    const stdout = [...debugBanner, "15.33.0", ""].join("\r\n");
    assert.strictEqual(parseVersionOutput(stdout), "15.33.0");
  });

  firebaseTest("reads the version when other text follows it", async () => {
    const stdout = ["15.33.0", "Update available 15.33.0 → 15.34.2"].join("\n");
    assert.strictEqual(parseVersionOutput(stdout), "15.33.0");
  });

  firebaseTest("finds no version in output without one", async () => {
    assert.strictEqual(parseVersionOutput(""), undefined);
    assert.strictEqual(parseVersionOutput(debugBanner.join("\n")), undefined);
    assert.strictEqual(
      parseVersionOutput("bash: firebase: command not found"),
      undefined,
    );
  });
});

firebaseSuite("logSetup", () => {
  firebaseTest(
    "keeps DEBUG out of the environment children inherit",
    async () => {
      const cliLogger = logger as unknown as {
        transports: object[];
        remove(transport: object): void;
      };
      const originalDebug = process.env.DEBUG;
      const before = [...cliLogger.transports];
      delete process.env.DEBUG;

      try {
        logSetup();
        assert.strictEqual(process.env.DEBUG, undefined);
      } finally {
        cliLogger.transports
          .filter((t) => !before.includes(t))
          .forEach((t) => cliLogger.remove(t));
        if (originalDebug !== undefined) {
          process.env.DEBUG = originalDebug;
        }
      }
    },
  );
});
