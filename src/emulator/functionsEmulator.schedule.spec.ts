import { expect } from "chai";
import * as sinon from "sinon";

import { EmulatableBackend, FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition } from "./functionsEmulatorShared";
import * as scheduleExpression from "./scheduleExpression";

function makeBackend(): EmulatableBackend {
  return {
    functionsDir: "/tmp/functions",
    env: {},
    secretEnv: [],
    codebase: "default",
  };
}

function makeScheduledDef(platform: "gcfv1" | "gcfv2"): EmulatedTriggerDefinition {
  return {
    id: "us-central1-scheduledFunc",
    region: "us-central1",
    name: "scheduledFunc",
    entryPoint: "scheduledFunc",
    platform,
    eventTrigger: {
      eventType: "google.pubsub.topic.publish",
      resource: "",
    },
    schedule: {
      schedule: "every 5 minutes",
    },
  };
}

function makeEmulator(backend: EmulatableBackend): FunctionsEmulator {
  return new FunctionsEmulator({
    projectId: "demo-test",
    projectDir: "/tmp/project",
    emulatableBackends: [backend],
    debugPort: false,
  });
}

describe("FunctionsEmulator scheduled triggers", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("registers v2 schedules without requiring Pub/Sub trigger registration", async () => {
    const backend = makeBackend();
    const emulator = makeEmulator(backend);
    const def = makeScheduledDef("gcfv2");

    sinon.stub(emulator, "discoverTriggers").resolves([def]);
    const addScheduledStub = sinon.stub(emulator as any, "addScheduledTrigger").returns(true);
    const addPubsubStub = sinon.stub(emulator, "addPubsubTrigger").resolves(false);

    await emulator.loadTriggers(backend, true);

    expect(addScheduledStub).to.have.been.calledOnce;
    expect(addPubsubStub).to.not.have.been.called;
  });

  it("keeps v1 manual Pub/Sub compatibility while scheduling automatically", async () => {
    const backend = makeBackend();
    const emulator = makeEmulator(backend);
    const def = makeScheduledDef("gcfv1");

    sinon.stub(emulator, "discoverTriggers").resolves([def]);
    const addScheduledStub = sinon.stub(emulator as any, "addScheduledTrigger").returns(true);
    const addPubsubStub = sinon.stub(emulator, "addPubsubTrigger").resolves(true);

    await emulator.loadTriggers(backend, true);

    expect(addScheduledStub).to.have.been.calledOnce;
    expect(addPubsubStub).to.have.been.calledOnce;
  });

  it("invokes v2 scheduled functions with Cloud Scheduler headers", async () => {
    const backend = makeBackend();
    const emulator = makeEmulator(backend);
    const def = makeScheduledDef("gcfv2");
    emulator.setTriggersForTesting([def], backend);
    const triggerKey = emulator.getTriggerKey(def);

    const sendStub = sinon.stub(emulator as any, "sendRequestByKey").resolves();
    const runTime = new Date("2026-02-06T00:05:00.000Z");

    await (emulator as any).invokeScheduledTrigger(triggerKey, runTime);

    expect(sendStub).to.have.been.calledOnce;
    expect(sendStub.firstCall.args[0]).to.equal(triggerKey);
    expect(sendStub.firstCall.args[1]).to.deep.equal({
      method: "POST",
      headers: {
        "X-CloudScheduler-JobName":
          "projects/demo-test/locations/us-central1/jobs/firebase-schedule-scheduledFunc-us-central1",
        "X-CloudScheduler-ScheduleTime": "2026-02-06T00:05:00.000Z",
      },
      body: "",
    });
  });

  it("invokes v1 scheduled functions with legacy background payloads", async () => {
    const backend = makeBackend();
    const emulator = makeEmulator(backend);
    const def = makeScheduledDef("gcfv1");
    emulator.setTriggersForTesting([def], backend);
    const triggerKey = emulator.getTriggerKey(def);

    const sendStub = sinon.stub(emulator as any, "sendRequestByKey").resolves();
    const runTime = new Date("2026-02-06T00:05:00.000Z");

    await (emulator as any).invokeScheduledTrigger(triggerKey, runTime);

    expect(sendStub).to.have.been.calledOnce;
    expect(sendStub.firstCall.args[0]).to.equal(triggerKey);
    expect(sendStub).to.have.been.calledWithMatch(triggerKey, {
      method: "POST",
      body: {
        context: {
          eventId: sinon.match.string,
          resource: {
            service: "pubsub.googleapis.com",
            name: "projects/demo-test/topics/firebase-schedule-scheduledFunc",
          },
          eventType: "google.pubsub.topic.publish",
          timestamp: "2026-02-06T00:05:00.000Z",
        },
        data: {
          data: "",
          attributes: {
            scheduled: "true",
          },
        },
      },
    });
  });

  it("clears scheduled timers when a trigger is removed", async () => {
    const clock = sinon.useFakeTimers(new Date("2026-02-06T00:00:00.000Z"));
    try {
      const backend = makeBackend();
      const emulator = makeEmulator(backend);
      const def = makeScheduledDef("gcfv2");
      emulator.setTriggersForTesting([def], backend);
      const triggerKey = emulator.getTriggerKey(def);

      sinon.stub(scheduleExpression, "getNextRun").returns(new Date("2026-02-06T00:00:01.000Z"));
      const runStub = sinon.stub(emulator as any, "runScheduledTrigger").resolves();

      const added = (emulator as any).addScheduledTrigger(triggerKey, def, backend);
      expect(added).to.equal(true);

      (emulator as any).clearScheduledTrigger(triggerKey);
      await clock.tickAsync(1_000);

      expect(runStub).to.not.have.been.called;
    } finally {
      clock.restore();
    }
  });

  it("uses Cloud Scheduler default timezone for v1 when not configured", () => {
    const backend = makeBackend();
    const emulator = makeEmulator(backend);
    const def = makeScheduledDef("gcfv1");
    emulator.setTriggersForTesting([def], backend);
    const triggerKey = emulator.getTriggerKey(def);
    const getNextRunStub = sinon
      .stub(scheduleExpression, "getNextRun")
      .returns(new Date("2026-02-06T00:05:00.000Z"));

    (emulator as any).addScheduledTrigger(triggerKey, def, backend);

    expect(getNextRunStub.firstCall.args[2]).to.equal("America/Los_Angeles");
    (emulator as any).clearScheduledTrigger(triggerKey);
  });

  it("uses Cloud Scheduler default timezone for v2 when not configured", () => {
    const backend = makeBackend();
    const emulator = makeEmulator(backend);
    const def = makeScheduledDef("gcfv2");
    emulator.setTriggersForTesting([def], backend);
    const triggerKey = emulator.getTriggerKey(def);
    const getNextRunStub = sinon
      .stub(scheduleExpression, "getNextRun")
      .returns(new Date("2026-02-06T00:05:00.000Z"));

    (emulator as any).addScheduledTrigger(triggerKey, def, backend);

    expect(getNextRunStub.firstCall.args[2]).to.equal("UTC");
    (emulator as any).clearScheduledTrigger(triggerKey);
  });
});
