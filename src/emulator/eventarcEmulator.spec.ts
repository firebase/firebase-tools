import { expect } from "chai";
import * as sinon from "sinon";
import * as supertest from "supertest";

import { EventarcEmulator } from "./eventarcEmulator";
import { CloudEvent } from "./events/types";
import { EmulatorRegistry } from "./registry";
import { Emulators } from "./types";
import * as events from "../functions/events";

interface MutationEventPayload {
  data: Record<string, string>;
  errors: string[];
}

describe("EventarcEmulator", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(true);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("delivers structured JSON CloudEvents published to /google/publishEvents when eventFilters match", async () => {
    const emulator = new EventarcEmulator({ host: "127.0.0.1", port: 9299 });
    const callStub = sandbox.stub(emulator, "callFunctionTrigger").resolves();
    const hub = emulator.createHubServer();

    await supertest(hub)
      .post("/emulator/v1/projects/my-project/triggers/us-central1-onMutate")
      .send(
        JSON.stringify({
          eventTrigger: {
            eventType: events.v2.DATACONNECT_EVENT,
            eventFilters: {
              service: "svc-alpha",
              connector: "conn-beta",
              operation: "CreateMovie",
            },
          },
        }),
      )
      .expect(200);

    const cloudEvent: CloudEvent<MutationEventPayload> = {
      specversion: "1.0",
      id: "evt-101",
      source:
        "//firebasedataconnect.googleapis.com/projects/my-project/locations/us-central1/services/svc-alpha/connectors/conn-beta",
      type: events.v2.DATACONNECT_EVENT,
      subject: "operations/CreateMovie",
      time: "2026-11-05T00:00:00Z",
      datacontenttype: "application/json",
      service: "svc-alpha",
      connector: "conn-beta",
      operation: "CreateMovie",
      project: "my-project",
      location: "us-central1",
      authid: "",
      data: { data: { title: "Inception" }, errors: [] },
    };

    await supertest(hub)
      .post("/google/publishEvents")
      .send(JSON.stringify({ events: [cloudEvent] }))
      .expect(200);

    expect(callStub.calledOnce).to.be.true;
    expect(callStub.firstCall.args[0]).to.deep.include({
      projectId: "my-project",
      triggerName: "us-central1-onMutate",
    });
    expect(callStub.firstCall.args[1]).to.deep.equal(cloudEvent);
  });

  it("skips triggers when structured JSON CloudEvent attributes do not match eventFilters", async () => {
    const emulator = new EventarcEmulator({ host: "127.0.0.1", port: 9299 });
    const callStub = sandbox.stub(emulator, "callFunctionTrigger").resolves();
    const hub = emulator.createHubServer();

    await supertest(hub)
      .post("/emulator/v1/projects/my-project/triggers/us-central1-onMutate")
      .send(
        JSON.stringify({
          eventTrigger: {
            eventType: events.v2.DATACONNECT_EVENT,
            eventFilters: {
              service: "svc-alpha",
              connector: "conn-beta",
              operation: "CreateMovie",
            },
          },
        }),
      )
      .expect(200);

    const cloudEvent: CloudEvent<MutationEventPayload> = {
      specversion: "1.0",
      id: "evt-102",
      source:
        "//firebasedataconnect.googleapis.com/projects/my-project/locations/us-central1/services/svc-alpha/connectors/conn-beta",
      type: events.v2.DATACONNECT_EVENT,
      time: "2026-11-05T00:00:00Z",
      service: "svc-alpha",
      connector: "conn-beta",
      operation: "DeleteMovie",
      authid: "",
      data: { data: { id: "movie-1" }, errors: [] },
    };

    await emulator.triggerEventFunction("google", cloudEvent);

    expect(callStub.called).to.be.false;
  });

  it("does not throw when a structured JSON CloudEvent omits both a filtered attribute and event.attributes", async () => {
    const emulator = new EventarcEmulator({ host: "127.0.0.1", port: 9299 });
    const callStub = sandbox.stub(emulator, "callFunctionTrigger").resolves();
    const hub = emulator.createHubServer();

    await supertest(hub)
      .post("/emulator/v1/projects/my-project/triggers/us-central1-onAuthMutate")
      .send(
        JSON.stringify({
          eventTrigger: {
            eventType: events.v2.DATACONNECT_EVENT,
            eventFilters: {
              service: "svc-alpha",
              authtype: "ADMIN",
            },
          },
        }),
      )
      .expect(200);

    const cloudEventWithoutOptionalAttr: CloudEvent<MutationEventPayload> = {
      specversion: "1.0",
      id: "evt-103",
      source:
        "//firebasedataconnect.googleapis.com/projects/my-project/locations/us-central1/services/svc-alpha/connectors/conn-beta",
      type: events.v2.DATACONNECT_EVENT,
      time: "2026-11-05T00:00:00Z",
      service: "svc-alpha",
      authid: "",
      data: { data: { title: "AnonymousEdit" }, errors: [] },
    };

    await emulator.triggerEventFunction("google", cloudEventWithoutOptionalAttr);

    expect(callStub.called).to.be.false;
  });
});
