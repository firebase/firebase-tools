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

import * as auth from "../auth";
import { configstore } from "../configstore";

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
      const account = auth.getGlobalDefaultAccount();
      expect(account).to.be.undefined;
    });
  });

  describe("single account", () => {
    const defaultAccount: auth.Account = {
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
      const account = auth.getGlobalDefaultAccount();
      expect(account).to.deep.equal(defaultAccount);
    });

    it("returns no additional accounts", () => {
      const additional = auth.getAdditionalAccounts();
      expect(additional.length).to.equal(0);
    });

    it("returns exactly one total account", () => {
      const all = auth.getAllAccounts();
      expect(all.length).to.equal(1);
      expect(all[0]).to.deep.equal(defaultAccount);
    });
  });

  describe("multi account", () => {
    const defaultAccount: auth.Account = {
      user: {
        email: "test@test.com",
      },
      tokens: {
        access_token: "abc1234",
      },
    };

    const additionalUser1: auth.Account = {
      user: {
        email: "test1@test.com",
      },
      tokens: {
        access_token: "token1",
      },
    };

    const additionalUser2: auth.Account = {
      user: {
        email: "test2@test.com",
      },
      tokens: {
        access_token: "token2",
      },
    };

    const additionalAccounts: auth.Account[] = [additionalUser1, additionalUser2];

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
      const account = auth.getGlobalDefaultAccount();
      expect(account).to.deep.equal(defaultAccount);
    });

    it("returns additional accounts", () => {
      const additional = auth.getAdditionalAccounts();
      expect(additional).to.deep.equal(additionalAccounts);
    });

    it("returns all accounts", () => {
      const all = auth.getAllAccounts();
      expect(all).to.deep.equal([defaultAccount, ...additionalAccounts]);
    });

    it("respects project default when present", () => {
      const account = auth.getProjectDefaultAccount("/path/project1");
      expect(account).to.deep.equal(additionalUser1);
    });

    it("ignores project default when not present", () => {
      const account = auth.getProjectDefaultAccount("/path/project2");
      expect(account).to.deep.equal(defaultAccount);
    });

    it("prefers account flag to project root", () => {
      const account = auth.selectAccount("test2@test.com", "/path/project1");
      expect(account).to.deep.equal(additionalUser2);
    });
  });
});
