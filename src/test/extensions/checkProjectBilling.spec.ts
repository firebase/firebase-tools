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

import * as chai from "chai";
chai.use(require("chai-as-promised"));
import * as sinon from "sinon";

import * as checkProjectBilling from "../../extensions/checkProjectBilling";
import * as prompt from "../../prompt";
import * as cloudbilling from "../../gcp/cloudbilling";

const expect = chai.expect;

describe("checkProjectBilling", () => {
  let promptOnceStub: sinon.SinonStub;
  let checkBillingEnabledStub: sinon.SinonStub;
  let listBillingAccountsStub: sinon.SinonStub;
  let setBillingAccountStub: sinon.SinonStub;

  beforeEach(() => {
    promptOnceStub = sinon.stub(prompt, "promptOnce");

    checkBillingEnabledStub = sinon.stub(cloudbilling, "checkBillingEnabled");
    checkBillingEnabledStub.resolves();

    listBillingAccountsStub = sinon.stub(cloudbilling, "listBillingAccounts");
    listBillingAccountsStub.resolves();

    setBillingAccountStub = sinon.stub(cloudbilling, "setBillingAccount");
    setBillingAccountStub.resolves();
  });

  afterEach(() => {
    promptOnceStub.restore();
    checkBillingEnabledStub.restore();
    listBillingAccountsStub.restore();
    setBillingAccountStub.restore();
  });

  it("should resolve if billing enabled", async () => {
    const projectId = "already enabled";

    checkBillingEnabledStub.resolves(true);

    const enabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!enabled) {
      await checkProjectBilling.enableBilling(projectId);
    }

    expect(listBillingAccountsStub.notCalled);
    expect(setBillingAccountStub.notCalled);
    expect(promptOnceStub.notCalled);
  });

  it("should list accounts if no billing account set, but accounts available.", async () => {
    const projectId = "not set, but have list";
    const accounts = [
      {
        name: "test-cloud-billing-account-name",
        open: true,
        displayName: "test-account",
      },
    ];

    checkBillingEnabledStub.resolves(false);
    listBillingAccountsStub.resolves(accounts);
    setBillingAccountStub.resolves(true);
    promptOnceStub.resolves("test-account");

    const enabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!enabled) {
      await checkProjectBilling.enableBilling(projectId);
    }

    expect(listBillingAccountsStub.calledOnce);
    expect(setBillingAccountStub.calledOnce);
    expect(setBillingAccountStub.calledWith(projectId, "test-cloud-billing-account-name"));
  });

  it("should not list accounts if no billing accounts set or available.", async () => {
    const projectId = "not set, not available";

    checkBillingEnabledStub.onCall(0).resolves(false);
    checkBillingEnabledStub.onCall(1).resolves(true);
    listBillingAccountsStub.resolves([]);
    promptOnceStub.resolves();

    const enabled = await cloudbilling.checkBillingEnabled(projectId);
    if (!enabled) {
      await checkProjectBilling.enableBilling(projectId);
    }

    expect(listBillingAccountsStub.calledOnce);
    expect(setBillingAccountStub.notCalled);
    expect(checkBillingEnabledStub.callCount).to.equal(2);
  });
});
