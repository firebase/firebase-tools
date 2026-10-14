import { expect } from "chai";
import nock from "../test/helpers/nock";
import * as sinon from "sinon";
import * as prompt from "../prompt";
import * as cloudbilling from "./cloudbilling";
import { cloudbillingOrigin } from "../api";
import { Setup } from "../init";
import * as ensureApiEnabled from "../ensureApiEnabled";

const PROJECT_ID = "test-project";

describe("cloudbilling", () => {
  let ensureStub: sinon.SinonStub;

  beforeEach(() => {
    ensureStub = sinon.stub(ensureApiEnabled, "ensure").resolves();
  });

  afterEach(() => {
    nock.cleanAll();
    cloudbilling.clearCache();
    ensureStub.restore();
  });

  describe("checkBillingEnabled", () => {
    it("should resolve with true if billing is enabled", async () => {
      nock(cloudbillingOrigin())
        .get(`/v1/projects/${PROJECT_ID}/billingInfo`)
        .matchHeader("x-goog-user-project", PROJECT_ID)
        .reply(200, { billingEnabled: true });

      const result = await cloudbilling.checkBillingEnabled(PROJECT_ID);

      expect(result).to.be.true;
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve with false if billing is not enabled", async () => {
      nock(cloudbillingOrigin())
        .get(`/v1/projects/${PROJECT_ID}/billingInfo`)
        .matchHeader("x-goog-user-project", PROJECT_ID)
        .reply(200, { billingEnabled: false });

      const result = await cloudbilling.checkBillingEnabled(PROJECT_ID);

      expect(result).to.be.false;
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if the API call fails", async () => {
      nock(cloudbillingOrigin())
        .get(`/v1/projects/${PROJECT_ID}/billingInfo`)
        .matchHeader("x-goog-user-project", PROJECT_ID)
        .reply(404, { error: { message: "Not Found" } });

      await expect(cloudbilling.checkBillingEnabled(PROJECT_ID)).to.be.rejectedWith("Not Found");
      expect(nock.isDone()).to.be.true;
    });

    it("should cache the result and not call API again", async () => {
      nock(cloudbillingOrigin())
        .get(`/v1/projects/${PROJECT_ID}/billingInfo`)
        .reply(200, { billingEnabled: true });

      const [result1, result2] = await Promise.all([
        cloudbilling.checkBillingEnabled(PROJECT_ID),
        cloudbilling.checkBillingEnabled(PROJECT_ID),
      ]);
      expect(result1).to.be.true;
      expect(result2).to.be.true;
      expect(nock.isDone()).to.be.true;
    });

    it("should force refresh if forceRefresh is true", async () => {
      nock(cloudbillingOrigin())
        .get(`/v1/projects/${PROJECT_ID}/billingInfo`)
        .reply(200, { billingEnabled: true });

      await cloudbilling.checkBillingEnabled(PROJECT_ID);

      nock(cloudbillingOrigin())
        .get(`/v1/projects/${PROJECT_ID}/billingInfo`)
        .reply(200, { billingEnabled: false });

      const result2 = await cloudbilling.checkBillingEnabled(PROJECT_ID, true);
      expect(result2).to.be.false;
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("isBillingEnabled", () => {
    it("should return the cached value if it exists", async () => {
      const setup: Setup = {
        isBillingEnabled: true,
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      const result = await cloudbilling.isBillingEnabled(setup);
      expect(result).to.be.true;
    });

    it("should return false if projectId is not set", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      const result = await cloudbilling.isBillingEnabled(setup);
      expect(result).to.be.false;
    });

    it("should call checkBillingEnabled if cache is empty", async () => {
      const setup: Setup = {
        projectId: PROJECT_ID,
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      nock(cloudbillingOrigin())
        .get(`/v1/projects/${PROJECT_ID}/billingInfo`)
        .matchHeader("x-goog-user-project", PROJECT_ID)
        .reply(200, { billingEnabled: true });

      const result = await cloudbilling.isBillingEnabled(setup);

      expect(result).to.be.true;
      expect(setup.isBillingEnabled).to.be.true;
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("setBillingAccount", () => {
    const billingAccountName = "billingAccounts/test-billing-account";
    it("should resolve with true on success", async () => {
      nock(cloudbillingOrigin())
        .put(`/v1/projects/${PROJECT_ID}/billingInfo`, {
          billingAccountName: billingAccountName,
        })
        .matchHeader("x-goog-user-project", PROJECT_ID)
        .reply(200, { billingEnabled: true });

      const result = await cloudbilling.setBillingAccount(PROJECT_ID, billingAccountName);

      expect(result).to.be.true;
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if the API call fails", async () => {
      nock(cloudbillingOrigin())
        .put(`/v1/projects/${PROJECT_ID}/billingInfo`, {
          billingAccountName: billingAccountName,
        })
        .matchHeader("x-goog-user-project", PROJECT_ID)
        .reply(403, { error: { message: "Permission Denied" } });

      await expect(
        cloudbilling.setBillingAccount(PROJECT_ID, billingAccountName),
      ).to.be.rejectedWith("Permission Denied");
      expect(nock.isDone()).to.be.true;
    });

    it("should update the cache", async () => {
      nock(cloudbillingOrigin())
        .put(`/v1/projects/${PROJECT_ID}/billingInfo`, {
          billingAccountName: billingAccountName,
        })
        .reply(200, { billingEnabled: true });

      await cloudbilling.setBillingAccount(PROJECT_ID, billingAccountName);
      expect(nock.isDone()).to.be.true;

      const result = await cloudbilling.checkBillingEnabled(PROJECT_ID);
      expect(result).to.be.true;
    });
  });

  describe("listBillingAccounts", () => {
    const billingAccount = {
      name: "billingAccounts/test-billing-account",
      open: "true",
      displayName: "Test Billing Account",
      masterBillingAccount: "",
    };

    it("should resolve with a list of billing accounts on success", async () => {
      nock(cloudbillingOrigin())
        .get("/v1/billingAccounts")
        .reply(200, { billingAccounts: [billingAccount] });

      const result = await cloudbilling.listBillingAccounts();

      expect(result).to.deep.equal([billingAccount]);
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve with an empty list if no billing accounts are returned", async () => {
      nock(cloudbillingOrigin()).get("/v1/billingAccounts").reply(200, {});

      const result = await cloudbilling.listBillingAccounts();

      expect(result).to.deep.equal([]);
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if the API call fails", async () => {
      nock(cloudbillingOrigin())
        .get("/v1/billingAccounts")
        .reply(404, { error: { message: "Not Found" } });

      await expect(cloudbilling.listBillingAccounts()).to.be.rejectedWith("Not Found");
      expect(nock.isDone()).to.be.true;
    });

    it("should include x-goog-user-project header when projectId is provided", async () => {
      nock(cloudbillingOrigin())
        .get("/v1/billingAccounts")
        .matchHeader("x-goog-user-project", PROJECT_ID)
        .reply(200, { billingAccounts: [billingAccount] });

      const result = await cloudbilling.listBillingAccounts(PROJECT_ID);

      expect(result).to.deep.equal([billingAccount]);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("enableBilling", () => {
    let confirmStub: sinon.SinonStub;
    let selectStub: sinon.SinonStub;
    let checkBillingEnabledStub: sinon.SinonStub;
    let listBillingAccountsStub: sinon.SinonStub;
    let setBillingAccountStub: sinon.SinonStub;

    beforeEach(() => {
      confirmStub = sinon.stub(prompt, "confirm");
      selectStub = sinon.stub(prompt, "select");

      checkBillingEnabledStub = sinon.stub(cloudbilling, "checkBillingEnabled");
      checkBillingEnabledStub.resolves();

      listBillingAccountsStub = sinon.stub(cloudbilling, "listBillingAccounts");
      listBillingAccountsStub.resolves();

      setBillingAccountStub = sinon.stub(cloudbilling, "setBillingAccount");
      setBillingAccountStub.resolves();
    });

    afterEach(() => {
      confirmStub.restore();
      selectStub.restore();
      checkBillingEnabledStub.restore();
      listBillingAccountsStub.restore();
      setBillingAccountStub.restore();
    });

    it("should resolve if billing enabled", async () => {
      const projectId = "already enabled";

      checkBillingEnabledStub.resolves(true);

      const enabled = await cloudbilling.checkBillingEnabled(projectId);
      if (!enabled) {
        await cloudbilling.enableBilling(projectId);
      }

      expect(listBillingAccountsStub.notCalled).to.be.true;
      expect(setBillingAccountStub.notCalled).to.be.true;
      expect(confirmStub.notCalled).to.be.true;
      expect(selectStub.notCalled).to.be.true;
    });

    it("should list accounts if no billing account set, but accounts available.", async () => {
      const projectId = "not set, but have list";
      const accounts = [
        {
          name: "test-cloud-billing-account-name",
          open: "true",
          displayName: "test-account",
          masterBillingAccount: "",
        },
      ];

      checkBillingEnabledStub.resolves(false);
      listBillingAccountsStub.resolves(accounts);
      setBillingAccountStub.resolves(true);
      selectStub.resolves("test-account");

      const enabled = await cloudbilling.checkBillingEnabled(projectId);
      if (!enabled) {
        await cloudbilling.enableBilling(projectId);
      }

      expect(listBillingAccountsStub.calledOnce).to.be.true;
      expect(listBillingAccountsStub.calledWith(projectId)).to.be.true;
      expect(setBillingAccountStub.calledOnce).to.be.true;
      expect(setBillingAccountStub.calledWith(projectId, "test-cloud-billing-account-name")).to.be
        .true;
    });

    it("should not list accounts if no billing accounts set or available.", async () => {
      const projectId = "not set, not available";

      checkBillingEnabledStub.onCall(0).resolves(false);
      checkBillingEnabledStub.onCall(1).resolves(true);
      listBillingAccountsStub.resolves([]);

      const enabled = await cloudbilling.checkBillingEnabled(projectId);
      if (!enabled) {
        await cloudbilling.enableBilling(projectId);
      }

      expect(listBillingAccountsStub.calledOnce).to.be.true;
      expect(listBillingAccountsStub.calledWith(projectId)).to.be.true;
      expect(setBillingAccountStub.notCalled).to.be.true;
      expect(checkBillingEnabledStub.callCount).to.equal(2);
    });
  });
});
