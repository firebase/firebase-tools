"use strict";

import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";
import * as pathLib from "path";
import { SinonSandbox } from "sinon";

import DatabaseRemove = require("../../database/remove");
import helpers = require("../helpers");

describe("Remote", () => {
  const databaseRemove = new DatabaseRemove("", {
    concurrency: 0,
    retires: 0,
    instance: "fake-db",
  });

  const remote = databaseRemove.remote;
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    helpers.mockAuth(sandbox);
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("listPath should work", (done) => {
    nock("https://fake-db.firebaseio.com")
      .get("/.json")
      .query({ shallow: true, limitToFirst: "50000" })
      .reply(200, {
        a: true,
        x: true,
        f: true,
      });
    expect(remote.listPath("/"))
      .to.eventually.eql(["a", "x", "f"])
      .notify(done);
  });

  it("prefetchTest should return empty", (done) => {
    nock("https://fake-db.firebaseio.com")
      .get("/empty/path.json")
      .query({ timeout: "100ms" })
      .reply(200, null);
    expect(remote.prefetchTest("/empty/path"))
      .to.eventually.eql("empty")
      .notify(done);
  });

  it("prefetchTest should return large", (done) => {
    nock("https://fake-db.firebaseio.com")
      .get("/large/path.json")
      .query({ timeout: "100ms" })
      .reply(400, {
        error:
          "Data requested exceeds the maximum size that can be accessed with a single request.",
      });
    expect(remote.prefetchTest("/large/path"))
      .to.eventually.eql("large")
      .notify(done);
  });

  it("prefetchTest should return small", (done) => {
    nock("https://fake-db.firebaseio.com")
      .get("/small/path.json")
      .query({ timeout: "100ms" })
      .reply(200, {
        x: "some data",
      });
    expect(remote.prefetchTest("/small/path"))
      .to.eventually.eql("small")
      .notify(done);
  });

  it("deletePath should work", () => {
    nock("https://fake-db.firebaseio.com")
      .delete("/a/b.json")
      .query({ print: "silent" })
      .reply(200, {});
    return remote.deletePath("/a/b");
  });
});

class TestRemote {
  public data: any;

  constructor(data: any) {
    this.data = data;
  }

  public deletePath(path: string): Promise<boolean> {
    if (path === "/") {
      this.data = null;
      return Promise.resolve(true);
    }
    const parentDir = pathLib.dirname(path);
    const basename = pathLib.basename(path);
    delete this._dataAtpath(parentDir)[basename];
    if (Object.keys(this._dataAtpath(parentDir)).length === 0) {
      return this.deletePath(parentDir);
    }
    return Promise.resolve(true);
  }

  public prefetchTest(path: string): Promise<string> {
    const d = this._dataAtpath(path);
    if (!d) {
      return Promise.resolve("empty");
    }
    if ("string" === typeof d) {
      return Promise.resolve("small");
    } else if (Object.keys(d).length === 0) {
      return Promise.resolve("empty");
    } else {
      return Promise.resolve("large");
    }
  }

  public listPath(path: string): Promise<string[]> {
    const d = this._dataAtpath(path);
    if (d) {
      return Promise.resolve(Object.keys(d));
    }
    return Promise.resolve([]);
  }

  private _dataAtpath(path: string): any {
    const splitedPath = path.slice(1).split("/");
    let d = this.data;
    for (const p of splitedPath) {
      if (d && p !== "") {
        if ("string" === typeof d) {
          d = null;
        } else {
          d = d[p];
        }
      }
    }
    return d;
  }
}

describe("TestRemote", () => {
  const fakeDb = new TestRemote({
    a: {
      b: "1",
      c: "2",
    },
    d: {
      e: "3",
    },
    f: null,
  });

  it("listPath should work", () => {
    expect(fakeDb.listPath("/")).to.eventually.eql(["a", "d", "f"]);
  });

  it("prefetchTest should return empty", (done) => {
    expect(fakeDb.prefetchTest("/f"))
      .to.eventually.eql("empty")
      .notify(done);
  });

  it("prefetchTest should return large", (done) => {
    expect(fakeDb.prefetchTest("/"))
      .to.eventually.eql("large")
      .notify(done);
  });

  it("prefetchTest should return small", (done) => {
    expect(fakeDb.prefetchTest("/d/e"))
      .to.eventually.eql("small")
      .notify(done);
  });

  it("deletePath should work", (done) => {
    fakeDb.deletePath("/a/b").then(() => {
      expect(fakeDb.listPath("/a"))
        .to.eventually.eql(["c"])
        .notify(done);
    });
  });
});

describe("DatabaseRemove", () => {
  it("DatabaseRemove should remove fakeDb at / 1", () => {
    const fakeDb = new TestRemote({
      c: "2",
    });
    const removeOps = new DatabaseRemove("/", {
      concurrency: 200,
      retries: 5,
      remote: fakeDb,
    });
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql(null);
    });
  });

  it("DatabaseRemove should remove fakeDb at / 2", () => {
    const fakeDb = new TestRemote({
      a: {
        b: { x: { y: "1" } },
        c: "2",
      },
      d: {
        e: "3",
      },
    });
    const removeOps = new DatabaseRemove("/", {
      concurrency: 200,
      retries: 5,
      remote: fakeDb,
    });
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql(null);
    });
  });

  it("DatabaseRemove should remove fakeDb at /a/b", () => {
    const fakeDb = new TestRemote({
      a: {
        b: { x: { y: "1" } },
        c: "2",
      },
      d: {
        e: "3",
      },
    });

    const removeOps = new DatabaseRemove("/a/b", {
      concurrency: 200,
      retries: 5,
      remote: fakeDb,
    });
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql({
        a: {
          c: "2",
        },
        d: {
          e: "3",
        },
      });
    });
  });

  it("DatabaseRemove should remove fakeDb at /a", () => {
    const fakeDb = new TestRemote({
      a: {
        b: { x: { y: "1" } },
        c: "2",
      },
      d: {
        e: "3",
      },
    });
    const removeOps = new DatabaseRemove("/a", {
      concurrency: 200,
      retries: 5,
      remote: fakeDb,
    });
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql({
        d: {
          e: "3",
        },
      });
    });
  });
});
