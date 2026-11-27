import { expect } from "chai";
import * as sinon from "sinon";

import { EmulatorLog } from "./types";

type SendCallback = (err: unknown) => void;

describe("EmulatorLog", () => {
  describe("flush()", () => {
    let stderrWrite: sinon.SinonStub;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalSend = process.send;

    beforeEach(() => {
      // Enforce the same chunk types the real stream does, so a regression throws here too.
      stderrWrite = sinon.stub(process.stderr, "write").callsFake((chunk: unknown): boolean => {
        if (typeof chunk !== "string" && !ArrayBuffer.isView(chunk)) {
          throw new TypeError(
            `The "chunk" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received ${typeof chunk}`,
          );
        }
        return true;
      });
    });

    afterEach(() => {
      sinon.restore();
      process.send = originalSend;
    });

    // Reports `err` to the send callback, the way Node does when the IPC channel has failed.
    function stubSend(err: unknown): void {
      process.send = ((
        _message: unknown,
        _sendHandle: unknown,
        _options: unknown,
        callback: SendCallback,
      ): boolean => {
        callback(err);
        return true;
      }) as unknown as typeof process.send;
    }

    it("writes the stack of an Error reported by process.send()", () => {
      stubSend(new Error("channel closed"));

      expect(() => new EmulatorLog("INFO", "system", "hello").log()).to.not.throw();

      expect(stderrWrite.calledOnce).to.be.true;
      const written = stderrWrite.firstCall.args[0] as string;
      expect(written).to.be.a("string");
      expect(written).to.contain("channel closed");
      expect(written).to.match(/\n$/);
    });

    it("writes a non-Error reported by process.send()", () => {
      stubSend("ERR_IPC_CHANNEL_CLOSED");

      expect(() => new EmulatorLog("INFO", "system", "hello").log()).to.not.throw();

      expect(stderrWrite.calledOnce).to.be.true;
      expect(stderrWrite.firstCall.args[0]).to.contain("ERR_IPC_CHANNEL_CLOSED");
    });

    it("writes nothing when process.send() succeeds", () => {
      stubSend(null);

      new EmulatorLog("INFO", "system", "hello").log();

      expect(stderrWrite.called).to.be.false;
    });
  });
});
