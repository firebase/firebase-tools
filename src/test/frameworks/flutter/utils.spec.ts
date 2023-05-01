import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import { Readable, Writable } from "stream";
import * as crossSpawn from "cross-spawn";

import { assertFlutterCliExists } from "../../../frameworks/flutter/utils";

describe("Flutter utils", () => {
  describe("assertFlutterCliExists", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return void, if !status", async () => {
      const process = new EventEmitter() as ChildProcess;
      process.stdin = new Writable();
      process.stdout = new EventEmitter() as Readable;
      process.stderr = new EventEmitter() as Readable;

      sandbox
        .stub(crossSpawn, "sync")
        .withArgs("flutter", ["--version"], { stdio: "ignore" })
        .returns(process as any);

      const result = (async () => {
        return assertFlutterCliExists();
      })();

      process.emit("close");

      expect(await result).to.be.undefined;
    });
  });
});
