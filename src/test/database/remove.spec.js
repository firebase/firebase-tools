"use strict";

const chai = require("chai");
const expect = chai.expect;
const pathLib = require("path");
const DatabaseRemove = require("../../database/remove");

class TestDatabaseRemoveHelper {
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

describe("TestDatabaseRemoveHelper", () => {
  const fakeDb = new TestDatabaseRemoveHelper({
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
    const fakeDb = new TestDatabaseRemoveHelper({
      c: "2",
    });
    var removeOps = new DatabaseRemove("/", {
      concurrency: 200,
      retries: 5,
      removeHelper: fakeDb,
    });
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql(null);
    });
  });

  it("DatabaseRemove should remove fakeDb at / 2", () => {
    const fakeDb = new TestDatabaseRemoveHelper({
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
      removeHelper: fakeDb,
    });
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql(null);
    });
  });

  it("DatabaseRemove should remove fakeDb at /a/b", () => {
    const fakeDb = new TestDatabaseRemoveHelper({
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
      removeHelper: fakeDb,
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
    const fakeDb = new TestDatabaseRemoveHelper({
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
      removeHelper: fakeDb,
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
