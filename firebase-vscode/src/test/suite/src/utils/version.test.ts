import * as assert from "assert";
import { firebaseSuite, firebaseTest } from "../../../utils/test_hooks";
import { parseVersion } from "../../../../utils/version";

firebaseSuite("parseVersion", () => {
  firebaseTest("parses standard single-line version", () => {
    assert.strictEqual(parseVersion("15.34.1\n"), "15.34.1");
    assert.strictEqual(parseVersion("15.33.0"), "15.33.0");
  });

  firebaseTest("parses version with 'v' prefix", () => {
    assert.strictEqual(parseVersion("v15.34.1"), "15.34.1");
  });

  firebaseTest("parses pre-release versions", () => {
    assert.strictEqual(parseVersion("15.34.1-alpha.1"), "15.34.1-alpha.1");
  });

  firebaseTest(
    "parses version from multi-line output with debug banner (issue #11363)",
    () => {
      const bannerOutput = [
        "[2026-10-27T16:10:13.531Z] ----------------------------------------------------------------------",
        "[2026-10-27T16:10:13.533Z] Command:       node /path/to/firebase.js --version",
        "[2026-10-27T16:10:13.534Z] CLI Version:   15.34.1",
        "[2026-10-27T16:10:13.534Z] Platform:      linux",
        "[2026-10-27T16:10:13.534Z] Node Version:  v20.11.1",
        "[2026-10-27T16:10:13.534Z] Detected Agent: antigravity",
        "[2026-10-27T16:10:13.534Z] Time:          Tue Oct 27 2026 16:10:13 GMT+0000",
        "[2026-10-27T16:10:13.535Z] ----------------------------------------------------------------------",
        "",
        "[2026-10-27T16:10:13.545Z] >>> [apiv2][query] GET https://firebase-public.firebaseio.com/cli.json [none]",
        "15.34.1",
      ].join("\n");

      assert.strictEqual(parseVersion(bannerOutput), "15.34.1");
    },
  );

  firebaseTest("parses npm version output", () => {
    assert.strictEqual(parseVersion("10.8.2\n"), "10.8.2");
  });

  firebaseTest("parses version embedded in text on non-log line", () => {
    assert.strictEqual(parseVersion("firebase-tools 15.34.1"), "15.34.1");
  });

  firebaseTest("returns undefined for empty or whitespace output", () => {
    assert.strictEqual(parseVersion(""), undefined);
    assert.strictEqual(parseVersion("   \n\t  "), undefined);
  });

  firebaseTest("returns undefined for command error output", () => {
    assert.strictEqual(
      parseVersion("sh: line 1: firebase: command not found"),
      undefined,
    );
  });

  firebaseTest(
    "returns undefined when only timestamped debug logs exist without version",
    () => {
      const logsOnly = [
        "[2026-10-27T16:10:13.531Z] ----------------------------------------------------------------------",
        "[2026-10-27T16:10:13.533Z] Command:       node /path/to/firebase.js --version",
        "[2026-10-27T16:10:13.535Z] ----------------------------------------------------------------------",
      ].join("\n");

      assert.strictEqual(parseVersion(logsOnly), undefined);
    },
  );
});

firebaseSuite("logSetup", () => {
  firebaseTest(
    "does not leak process.env.DEBUG when initially undefined",
    () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { logSetup } = require("../../../../logger-wrapper");
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;
      try {
        logSetup();
        assert.strictEqual(
          process.env.DEBUG,
          undefined,
          "process.env.DEBUG should be undefined after logSetup()",
        );
      } finally {
        if (originalDebug === undefined) {
          delete process.env.DEBUG;
        } else {
          process.env.DEBUG = originalDebug;
        }
      }
    },
  );

  firebaseTest("restores process.env.DEBUG when initially set", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logSetup } = require("../../../../logger-wrapper");
    const originalDebug = process.env.DEBUG;
    process.env.DEBUG = "initial_debug_value";
    try {
      logSetup();
      assert.strictEqual(
        process.env.DEBUG,
        "initial_debug_value",
        "process.env.DEBUG should be restored to initial value after logSetup()",
      );
    } finally {
      if (originalDebug === undefined) {
        delete process.env.DEBUG;
      } else {
        process.env.DEBUG = originalDebug;
      }
    }
  });
});
