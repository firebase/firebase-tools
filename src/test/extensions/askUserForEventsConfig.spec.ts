/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";
import * as sinon from "sinon";

import {
  askForEventArcLocation,
  askForAllowedEventTypes,
  checkAllowedEventTypesResponse,
} from "../../extensions/askUserForEventsConfig";
import * as utils from "../../utils";
import * as prompt from "../../prompt";

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
        [{ type: "google.firebase.custom-event-occurred", description: "A custom event occurred" }]
      )
    ).to.equal(false);
    expect(
      logWarningSpy.calledWith(
        "Unexpected event type 'google.firebase.nonexistent-event-occurred' was configured to be emitted. This event type is not part of the extension spec."
      )
    ).to.equal(true);
  });

  it("should return true if every allowed event exists in extension spec's events list", () => {
    expect(
      checkAllowedEventTypesResponse(
        ["google.firebase.custom-event-occurred"],
        [{ type: "google.firebase.custom-event-occurred", description: "A custom event occurred" }]
      )
    ).to.equal(true);
  });
});

describe("askForAllowedEventTypes", () => {
  let promptStub: sinon.SinonStub;

  afterEach(() => {
    promptStub.restore();
  });

  it("should keep prompting user until valid input is given", async () => {
    promptStub = sinon.stub(prompt, "promptOnce");
    promptStub.onCall(0).returns(["invalid"]);
    promptStub.onCall(1).returns(["stillinvalid"]);
    promptStub.onCall(2).returns(["google.firebase.custom-event-occurred"]);
    await askForAllowedEventTypes([
      { type: "google.firebase.custom-event-occurred", description: "A custom event occurred" },
    ]);
    expect(promptStub.calledThrice).to.be.true;
  });
});

describe("askForEventarcLocation", () => {
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
    promptStub.onCall(0).returns("invalid-region");
    promptStub.onCall(1).returns("still-invalid-region");
    promptStub.onCall(2).returns("us-central1");
  });

  afterEach(() => {
    promptStub.restore();
  });

  it("should keep prompting user until valid input is given", async () => {
    await askForEventArcLocation();
    expect(promptStub.calledThrice).to.be.true;
  });
});
