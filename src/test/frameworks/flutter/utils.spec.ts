import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import { Readable, Writable } from "stream";
import * as crossSpawn from "cross-spawn";
import * as fsExtra from "fs-extra";
import * as fsPromises from "fs/promises";

import * as frameworksFunctions from "../../../frameworks";
import { assertFlutterCliExists } from "../../../frameworks/flutter/utils";
import {
  discover,
  build,
  ɵcodegenPublicDirectory,
} from "../../../frameworks/flutter";
import { FirebaseError } from "../../../error";
import { join } from "path";

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

      sandbox.stub(crossSpawn, "sync").withArgs("flutter", ["--version"], { stdio: "ignore" }).returns(process as any);

      const result = (async () => { return assertFlutterCliExists() })();

      process.emit("close");

      expect(await result).to.be.undefined;
    });
  });
});
