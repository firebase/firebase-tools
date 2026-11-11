import { expect } from "chai";
import * as sinon from "sinon";
import { Client } from "../apiv2";
import { FunctionsEmulator } from "./functionsEmulator";
import { EmulatorRegistry } from "./registry";
import { Emulators } from "./types";
import {
  BEFORE_CREATE_EVENT,
  BEFORE_SEND_EMAIL_EVENT,
  BEFORE_SEND_SMS_EVENT,
  BEFORE_SIGN_IN_EVENT,
} from "../functions/events/v1";
import { BlockingFunctionsConfig } from "../gcp/identityPlatform";

describe("FunctionsEmulator", () => {
  describe("addBlockingTrigger", () => {
    let emu: FunctionsEmulator;
    let patch: sinon.SinonStub;

    beforeEach(() => {
      emu = new FunctionsEmulator({
        projectId: "demo-project",
        projectDir: ".",
        emulatableBackends: [],
        debugPort: false,
        verbosity: "QUIET",
      });
      sinon.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.AUTH).returns(true);
      sinon.stub(EmulatorRegistry, "client").returns(new Client({ urlPrefix: "http://auth" }));
      patch = sinon.stub(Client.prototype, "patch").resolves();
    });

    afterEach(() => {
      sinon.restore();
    });

    async function expectConfigSentToAuth(
      blockingFunctions: BlockingFunctionsConfig,
    ): Promise<void> {
      await emu.performPostLoadOperations();
      expect(patch).to.have.been.calledOnceWith(sinon.match.string, { blockingFunctions });
    }

    it("registers each blocking event under its own trigger", async () => {
      const options = { accessToken: false, idToken: false, refreshToken: false };
      emu.addBlockingTrigger("http://create", { eventType: BEFORE_CREATE_EVENT, options });
      emu.addBlockingTrigger("http://signin", { eventType: BEFORE_SIGN_IN_EVENT, options });
      emu.addBlockingTrigger("http://email", { eventType: BEFORE_SEND_EMAIL_EVENT, options: {} });
      emu.addBlockingTrigger("http://sms", { eventType: BEFORE_SEND_SMS_EVENT, options: {} });

      await expectConfigSentToAuth({
        triggers: {
          beforeCreate: { functionUri: "http://create" },
          beforeSignIn: { functionUri: "http://signin" },
          beforeSendEmail: { functionUri: "http://email" },
          beforeSendSms: { functionUri: "http://sms" },
        },
        forwardInboundCredentials: options,
      });
    });

    it("keeps credential forwarding set by an earlier trigger", async () => {
      emu.addBlockingTrigger("http://signin", {
        eventType: BEFORE_SIGN_IN_EVENT,
        options: { accessToken: false, idToken: true, refreshToken: false },
      });
      emu.addBlockingTrigger("http://email", { eventType: BEFORE_SEND_EMAIL_EVENT, options: {} });

      await expectConfigSentToAuth({
        triggers: {
          beforeSignIn: { functionUri: "http://signin" },
          beforeSendEmail: { functionUri: "http://email" },
        },
        forwardInboundCredentials: { accessToken: false, idToken: true, refreshToken: false },
      });
    });

    it("ignores events that are not auth blocking events", async () => {
      expect(emu.addBlockingTrigger("http://x", { eventType: "not.a.blocking.event", options: {} }))
        .to.be.false;

      await emu.performPostLoadOperations();
      expect(patch).to.not.have.been.called;
    });
  });
});
