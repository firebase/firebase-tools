"use strict";

const chai = require("chai");
chai.use(require("chai-as-promised"));
const sinon = require("sinon");

const checkProjectBilling = require("../../extensions/checkProjectBilling");
const prompt = require("../../prompt");
const cloudbilling = require("../../gcp/cloudbilling");

const expect = chai.expect;

describe("checkProjectBilling", function () {
  /** @type {sinon.SinonStub} */
  let promptOnceStub;

  /** @type {sinon.SinonStub} */
  let checkBillingEnabledStub;

  /** @type {sinon.SinonStub} */
  let listBillingAccountsStub;

  /** @type {sinon.SinonStub} */
  let setBillingAccountStub;

  beforeEach(function () {
    promptOnceStub = sinon.stub(prompt, "promptOnce");

    checkBillingEnabledStub = sinon.stub(cloudbilling, "checkBillingEnabled");
    checkBillingEnabledStub.resolves();

    listBillingAccountsStub = sinon.stub(cloudbilling, "listBillingAccounts");
    listBillingAccountsStub.resolves();

    setBillingAccountStub = sinon.stub(cloudbilling, "setBillingAccount");
    setBillingAccountStub.resolves();
  });

  afterEach(function () {
    promptOnceStub.restore();
    checkBillingEnabledStub.restore();
    listBillingAccountsStub.restore();
    setBillingAccountStub.restore();
  });

  it("should resolve if billing enabled.", function () {
    const projectId = "already enabled";
    const extensionName = "test extension";

    checkBillingEnabledStub.resolves(true);

    return checkProjectBilling
      .isBillingEnabled(projectId)
      .then((enabled) => {
        if (!enabled) {
          return checkProjectBilling.enableBilling(projectId, extensionName);
        }
      })
      .then(() => {
        expect(checkBillingEnabledStub.calledWith(projectId));
        expect(listBillingAccountsStub.notCalled);
        expect(setBillingAccountStub.notCalled);
        expect(promptOnceStub.notCalled);
      });
  });

  it("should list accounts if no billing account set, but accounts available.", function () {
    const projectId = "not set, but have list";
    const extensionName = "test extension 2";
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

    return checkProjectBilling
      .isBillingEnabled(projectId)
      .then((enabled) => {
        if (!enabled) {
          return checkProjectBilling.enableBilling(projectId, extensionName);
        }
      })
      .then(() => {
        expect(checkBillingEnabledStub.calledWith(projectId));
        expect(listBillingAccountsStub.calledOnce);
        expect(setBillingAccountStub.calledOnce);
        expect(setBillingAccountStub.calledWith(projectId, "test-cloud-billing-account-name"));
      });
  });

  it("should not list accounts if no billing accounts set or available.", function () {
    const projectId = "not set, not available";
    const extensionName = "test extension 3";
    const accounts = [];

    checkBillingEnabledStub.onCall(0).resolves(false);
    checkBillingEnabledStub.onCall(1).resolves(true);
    listBillingAccountsStub.resolves(accounts);
    promptOnceStub.resolves();

    return checkProjectBilling
      .isBillingEnabled(projectId)
      .then((enabled) => {
        if (!enabled) {
          return checkProjectBilling.enableBilling(projectId, extensionName);
        }
      })
      .then(() => {
        expect(checkBillingEnabledStub.calledWith(projectId));
        expect(listBillingAccountsStub.calledOnce);
        expect(setBillingAccountStub.notCalled);
        expect(checkBillingEnabledStub.callCount).to.equal(2);
      });
  });
});
