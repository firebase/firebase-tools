import { expect } from "chai";
import * as nock from "nock";
import * as cloudbilling from "./cloudbilling";
import { cloudbillingOrigin } from "../api";
import { Setup } from "../init";

const PROJECT_ID = "test-project";

describe("cloudbilling", () => {
  afterEach(() => {
    nock.cleanAll();
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
  });
});
