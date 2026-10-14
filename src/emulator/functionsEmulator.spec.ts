import { expect } from "chai";
import * as http from "http";
import * as sinon from "sinon";
import { PassThrough } from "stream";

import { FunctionsEmulator } from "./functionsEmulator";
import {
  DEBUG_SIGNATURE_HEADER,
  DEBUG_TARGET_HEADER,
  EmulatedTriggerDefinition,
} from "./functionsEmulatorShared";

describe("FunctionsEmulator", () => {
  describe("sendRequest", () => {
    const trigger: EmulatedTriggerDefinition = {
      id: "us-central1-group-fn",
      name: "group-fn",
      entryPoint: "group.fn",
      region: "us-central1",
      platform: "gcfv1",
      eventTrigger: { eventType: "providers/cloud.pubsub/eventTypes/topic.publish" },
    };
    let requestStub: sinon.SinonStub;

    beforeEach(() => {
      requestStub = sinon.stub(http, "request").callsFake((options: any, callback: any) => {
        process.nextTick(() => callback(new PassThrough()));
        return new PassThrough() as any;
      });
    });

    afterEach(() => {
      sinon.restore();
    });

    function emulatorWithIdleWorker(debugPort: number | boolean): FunctionsEmulator {
      const emu = new FunctionsEmulator({
        projectId: "demo-test",
        projectDir: "/tmp",
        emulatableBackends: [{ functionsDir: "/tmp", env: {}, secretEnv: [], codebase: "default" }],
        verbosity: "QUIET",
        debugPort,
      });
      sinon
        .stub(emu as any, "getTriggerRecordByKey")
        .returns({ backend: { codebase: "default", runtime: "nodejs22" } });
      const pool = (emu as any).workerPools["default"];
      sinon.stub(pool, "readyForWork").returns(true);
      sinon.stub(pool, "getIdleWorker").returns({
        runtime: { conn: { httpReqOpts: () => ({ socketPath: "/tmp/fn.sock" }) } },
      });
      return emu;
    }

    it("sends the debug target and signature headers in debug mode", async () => {
      await emulatorWithIdleWorker(9229).sendRequest(trigger, { data: 1 });

      expect(requestStub.firstCall.args[0].headers).to.deep.equal({
        "Content-Type": "application/json",
        "Content-Length": "10",
        [DEBUG_TARGET_HEADER]: "group.fn",
        [DEBUG_SIGNATURE_HEADER]: "event",
      });
    });

    it("sends no debug headers outside debug mode", async () => {
      await emulatorWithIdleWorker(false).sendRequest(trigger, { data: 1 });

      expect(requestStub.firstCall.args[0].headers).to.deep.equal({
        "Content-Type": "application/json",
        "Content-Length": "10",
      });
    });
  });
});
