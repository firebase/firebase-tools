import { expect } from "chai";
import * as sinon from "sinon";

import {
  askForEventArcLocation,
  askForAllowedEventTypes,
  checkAllowedEventTypesResponse,
} from "./askUserForEventsConfig";
import * as utils from "../utils";
import * as prompt from "../prompt";

describe("checkAllowedEventTypesResponse", () => {
  let logWarningSpy: sinon.SinonSpy;
  beforeEach(() => {
    logWarningSpy = sinon.spy(utils, "logWarning");
  });

  afterEach(() => {
    logWarningSpy.restore();
  });

  it("should return false if allowed events is not part of extension spec's events list", () => {
    expect(
      checkAllowedEventTypesResponse(
        ["google.firebase.nonexistent-event-occurred"],
        [{ type: "google.firebase.custom-event-occurred", description: "A custom event occurred" }],
      ),
    ).to.equal(false);
    expect(
      logWarningSpy.calledWith(
        "Unexpected event type 'google.firebase.nonexistent-event-occurred' was configured to be emitted. This event type is not part of the extension spec.",
      ),
    ).to.equal(true);
  });

  it("should return true if every allowed event exists in extension spec's events list", () => {
    expect(
      checkAllowedEventTypesResponse(
        ["google.firebase.custom-event-occurred"],
        [{ type: "google.firebase.custom-event-occurred", description: "A custom event occurred" }],
      ),
    ).to.equal(true);
  });
});

describe("askForAllowedEventTypes", () => {
  let checkboxStub: sinon.SinonStub;

  beforeEach(() => {
    checkboxStub = sinon.stub(prompt, "checkbox");
  });

  afterEach(() => {
    checkboxStub.restore();
  });

  it("should keep prompting user until valid input is given", async () => {
    checkboxStub.onCall(0).resolves(["invalid"]);
    checkboxStub.onCall(1).resolves(["stillinvalid"]);
    checkboxStub.onCall(2).resolves(["google.firebase.custom-event-occurred"]);
    await askForAllowedEventTypes([
      { type: "google.firebase.custom-event-occurred", description: "A custom event occurred" },
    ]);
    expect(checkboxStub).to.be.calledThrice;
  });
});

describe("askForEventarcLocation", () => {
  let selectStub: sinon.SinonStub;

  beforeEach(() => {
    selectStub = sinon.stub(prompt, "select");
  });

  afterEach(() => {
    selectStub.restore();
  });

  it("should keep prompting user until valid input is given", async () => {
    selectStub.onCall(0).returns("invalid-region");
    selectStub.onCall(1).returns("still-invalid-region");
    selectStub.onCall(2).returns("us-central1");
    await askForEventArcLocation();
    expect(selectStub).to.be.calledThrice;
  });
});
