import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./appcheck-services-set";
import * as api from "../appcheck/api";
import * as projectUtils from "../projectUtils";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { Service } from "../appcheck/types";

const PROJECT_NUMBER = "1234567890";

function service(serviceId: string, mode?: string): Service {
  return {
    name: `projects/${PROJECT_NUMBER}/services/${serviceId}`,
    ...(mode ? { enforcementMode: mode as Service["enforcementMode"] } : {}),
  };
}

describe("appcheck:services:set", () => {
  let getServiceStub: sinon.SinonStub;
  let updateServiceStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;

  beforeEach(() => {
    command["befores"] = []; // bypass auth hook, befores is private
    sinon.stub(projectUtils, "needProjectNumber").resolves(PROJECT_NUMBER);
    sinon.stub(utils, "logSuccess");
    getServiceStub = sinon
      .stub(api, "getService")
      .resolves(service("firestore.googleapis.com", "UNENFORCED"));
    updateServiceStub = sinon
      .stub(api, "updateService")
      .resolves(service("firestore.googleapis.com", "ENFORCED"));
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
  });

  afterEach(() => sinon.restore());

  it("enforces after confirmation", async () => {
    await command.runner()("firestore", "enforced", { project: "p", interactive: true });

    expect(confirmStub).to.have.been.calledOnce;
    expect(updateServiceStub).to.have.been.calledWith(PROJECT_NUMBER, "firestore.googleapis.com", {
      enforcementMode: "ENFORCED",
      replayProtection: undefined,
    });
  });

  it("aborts without writing when the confirmation is declined", async () => {
    confirmStub.resolves(false);

    await expect(
      command.runner()("firestore", "enforced", { project: "p", interactive: true }),
    ).to.be.rejectedWith(FirebaseError, /aborted/i);
    expect(updateServiceStub).to.not.have.been.called;
  });

  it("relaxes without asking", async () => {
    getServiceStub.resolves(service("firestore.googleapis.com", "ENFORCED"));

    await command.runner()("firestore", "unenforced", { project: "p" });

    expect(confirmStub).to.not.have.been.called;
    expect(updateServiceStub).to.have.been.called;
  });

  it("passes replay protection through when it is allowed", async () => {
    await command.runner()("firestore", "enforced", {
      project: "p",
      force: true,
      replayProtection: "unenforced",
    });

    expect(updateServiceStub).to.have.been.calledWith(PROJECT_NUMBER, "firestore.googleapis.com", {
      enforcementMode: "ENFORCED",
      replayProtection: "UNENFORCED",
    });
  });

  it("rejects replay protection stronger than enforcement, before any API call", async () => {
    await expect(
      command.runner()("firestore", "unenforced", { project: "p", replayProtection: "enforced" }),
    ).to.be.rejectedWith(FirebaseError, /cannot be stronger/);
    expect(getServiceStub).to.not.have.been.called;
    expect(updateServiceStub).to.not.have.been.called;
  });

  it("explains a 400 on a service that does not support replay protection", async () => {
    // Only some services accept replayProtection, and the API says nothing
    // more useful than "invalid argument".
    updateServiceStub.rejects(new FirebaseError("invalid argument", { status: 400 }));

    await expect(
      command.runner()("firestore", "enforced", {
        project: "p",
        force: true,
        replayProtection: "unenforced",
      }),
    ).to.be.rejectedWith(FirebaseError, /Not every service supports it/);
  });

  it("does not reinterpret a 400 when replay protection was not requested", async () => {
    updateServiceStub.rejects(new FirebaseError("some other problem", { status: 400 }));

    await expect(
      command.runner()("firestore", "enforced", { project: "p", force: true }),
    ).to.be.rejectedWith(FirebaseError, /some other problem/);
  });

  it("rejects an unknown service and an unknown mode before any API call", async () => {
    await expect(command.runner()("functions", "enforced", { project: "p" })).to.be.rejectedWith(
      FirebaseError,
      /Unknown service/,
    );
    await expect(command.runner()("firestore", "on", { project: "p" })).to.be.rejectedWith(
      FirebaseError,
      /Unknown mode/,
    );
    expect(getServiceStub).to.not.have.been.called;
  });
});
