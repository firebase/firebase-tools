import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import { Writable } from "stream";
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

    it("should return void, if !status", () => {
      const process = new EventEmitter() as any;
      process.stdin = new Writable();
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.status = 0;

      const stub = sandbox.stub(crossSpawn, "sync").returns(process as any);

      expect(assertFlutterCliExists()).to.be.undefined;
      sinon.assert.calledWith(stub, "flutter", ["--version"], { stdio: "ignore" });
    });
  });
});
