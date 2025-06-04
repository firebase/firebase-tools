import { expect } from "chai";
import * as sinon from "sinon";

import {
  getAdditionalAccounts,
  getAllAccounts,
  getGlobalDefaultAccount,
  getProjectDefaultAccount,
  selectAccount,
} from "./auth";
import { configstore } from "./configstore";
import { Account } from "./types/auth";

describe("auth", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let fakeConfigStore: any = {};

  beforeEach(() => {
    const configstoreGetStub = sandbox.stub(configstore, "get");
    configstoreGetStub.callsFake((key: string) => {
      return fakeConfigStore[key];
    });

    const configstoreSetStub = sandbox.stub(configstore, "set");
    configstoreSetStub.callsFake((...values: any) => {
      fakeConfigStore[values[0]] = values[1];
    });

    const configstoreDeleteStub = sandbox.stub(configstore, "delete");
    configstoreDeleteStub.callsFake((key: string) => {
      delete fakeConfigStore[key];
    });
  });

  afterEach(() => {
    fakeConfigStore = {};
    sandbox.restore();
  });

  describe("no accounts", () => {
    it("returns no global account when config is empty", () => {
      const account = getGlobalDefaultAccount();
      expect(account).to.be.undefined;
    });
  });

  describe("single account", () => {
    const defaultAccount: Account = {
      user: {
        email: "test@test.com",
      },
      tokens: {
        access_token: "abc1234",
      },
    };

    beforeEach(() => {
      configstore.set("user", defaultAccount.user);
      configstore.set("tokens", defaultAccount.tokens);
    });

    it("returns global default account", () => {
      const account = getGlobalDefaultAccount();
      expect(account).to.deep.equal(defaultAccount);
    });

    it("returns no additional accounts", () => {
      const additional = getAdditionalAccounts();
      expect(additional.length).to.equal(0);
    });

    it("returns exactly one total account", () => {
      const all = getAllAccounts();
      expect(all.length).to.equal(1);
      expect(all[0]).to.deep.equal(defaultAccount);
    });
  });

  describe("multi account", () => {
    const defaultAccount: Account = {
      user: {
        email: "test@test.com",
      },
      tokens: {
        access_token: "abc1234",
      },
    };

    const additionalUser1: Account = {
      user: {
        email: "test1@test.com",
      },
      tokens: {
        access_token: "token1",
      },
    };

    const additionalUser2: Account = {
      user: {
        email: "test2@test.com",
      },
      tokens: {
        access_token: "token2",
      },
    };

    const additionalAccounts: Account[] = [additionalUser1, additionalUser2];

    const activeAccounts = {
      "/path/project1": "test1@test.com",
    };

    beforeEach(() => {
      configstore.set("user", defaultAccount.user);
      configstore.set("tokens", defaultAccount.tokens);
      configstore.set("additionalAccounts", additionalAccounts);
      configstore.set("activeAccounts", activeAccounts);
    });

    it("returns global default account", () => {
      const account = getGlobalDefaultAccount();
      expect(account).to.deep.equal(defaultAccount);
    });

    it("returns additional accounts", () => {
      const additional = getAdditionalAccounts();
      expect(additional).to.deep.equal(additionalAccounts);
    });

    it("returns all accounts", () => {
      const all = getAllAccounts();
      expect(all).to.deep.equal([defaultAccount, ...additionalAccounts]);
    });

    it("respects project default when present", () => {
      const account = getProjectDefaultAccount("/path/project1");
      expect(account).to.deep.equal(additionalUser1);
    });

    it("ignores project default when not present", () => {
      const account = getProjectDefaultAccount("/path/project2");
      expect(account).to.deep.equal(defaultAccount);
    });

    it("prefers account flag to project root", () => {
      const account = selectAccount("test2@test.com", "/path/project1");
      expect(account).to.deep.equal(additionalUser2);
    });
  });
});
