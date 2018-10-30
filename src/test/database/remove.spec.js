"use strict";

const chai = require("chai");
const nock = require("nock");
const sinon = require("sinon");
const expect = chai.expect;
const pathLib = require("path");
const DatabaseRemove = require("../../database/remove");
const helpers = require("../helpers");

describe("TestRemote", () => {
  var databaseRemove = new DatabaseRemove("", {
    concurrency: 0,
    retires: 0,
    instance: "fake-db",
  });

  var remote = databaseRemove.remote;
  var sandbox;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    helpers.mockAuth(sandbox);
  });

  afterEach(function() {
    sandbox.restore();
    nock.cleanAll();
  });

  it("listPath should work", done => {
    nock("https://fake-db.firebaseio.com")
      .get("/.json")
      .query({ shallow: true, limitToFirst: "10000" })
      .reply(200, {
        a: true,
        x: true,
        f: true,
      });
    expect(remote.listPath("/"))
      .to.eventually.eql(["a", "x", "f"])
      .notify(done);
  });

  it("prefetchTest should return empty", done => {
    nock("https://fake-db.firebaseio.com")
      .get("/empty/path.json")
      .query({ timeout: "100ms" })
      .reply(200, null);
    expect(remote.prefetchTest("/empty/path"))
      .to.eventually.eql("empty")
      .notify(done);
  });

  it("prefetchTest should return large", done => {
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

  it("prefetchTest should return small", done => {
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
  constructor(data) {
    this.data = data;
  }

  _dataAtpath(path) {
    const splitedPath = path.slice(1).split("/");
    var d = this.data;
    for (var i = 0; i < splitedPath.length; i++) {
      if (d && splitedPath[i] !== "") {
        if ("string" === typeof d) {
          d = null;
        } else {
          d = d[splitedPath[i]];
        }
      }
    }
    return d;
  }

  deletePath(path) {
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

  prefetchTest(path) {
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

  listPath(path) {
    const d = this._dataAtpath(path);
    if (d) {
      return Promise.resolve(Object.keys(d));
    }
    return Promise.resolve([]);
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

  it("prefetchTest should return empty", done => {
    expect(fakeDb.prefetchTest("/f"))
      .to.eventually.eql("empty")
      .notify(done);
  });

  it("prefetchTest should return large", done => {
    expect(fakeDb.prefetchTest("/"))
      .to.eventually.eql("large")
      .notify(done);
  });

  it("prefetchTest should return small", done => {
    expect(fakeDb.prefetchTest("/d/e"))
      .to.eventually.eql("small")
      .notify(done);
  });

  it("deletePath should work", done => {
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
    var removeOps = new DatabaseRemove("/", {
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
    var removeOps = new DatabaseRemove("/", {
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

    var removeOps = new DatabaseRemove("/a/b", {
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
    var removeOps = new DatabaseRemove("/a", {
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
