"use strict";

const DatabaseRemove = require("../database/remove");
const chai = require("chai");
const expect = chai.expect;
const pathLib = require("path");

class TestDatabaseRemoveHelper {
  constructor(data) {
    this.data = data;
  }

  _dataAtpath(path) {
    const splitedPath = path.slice(0).split("/");
    var d = this.data;
    console.log(d);
    for (var i = 1; i < splitedPath.length; i++) {
      if (d && splitedPath[i] !== "" && "string" !== typeof d) {
        d = d[splitedPath[i]];
        console.log(d, splitedPath[i]);
      }
    }
    return d;
  }

  deletePath(path) {
    const parentDir = pathLib.dirname(path);
    const basename = pathLib.basename(path);
    delete this._dataAtpath(parentDir)[basename];
    return Promise.resolve();
  }

  prefetchTest(path) {
    const d = this._dataAtpath(path);
    if (d) {
      if ("string" === typeof d) {
        return Promise.resolve("small");
      } else {
        return Promise.resolve("large");
      }
    } else {
      return Promise.resolve("empty");
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
  });

  it("listPath should work", () => {
    expect(fakeDb.listPath("/")).to.eventually.eql(["a", "d"]);
  });

  it("prefetchTest should return empty", done => {
    expect(fakeDb.prefetchTest("/z"))
      .to.eventually.eql("empty")
      .notify(done);
  });

  it("prefetchTest should return large", done => {
    expect(fakeDb.prefetchTest("/"))
      .to.eventually.eql("large")
      .notify(done);
  });

  it("prefetchTest should return small", done => {
    expect(fakeDb.prefetchTest("/a/b"))
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
  const fakeDb = new TestDatabaseRemoveHelper({
    a: {
      b: { x: { y: "1" } },
      c: "2",
    },
    d: {
      e: "3",
    },
  });

  it("DatabaseRemove should remove fakeDb", () => {
    var removeOps = new DatabaseRemove("/", {
      concurrency: 200,
      retries: 5,
      removeHelper: fakeDb,
    });
    removeOps.execute().then(() => {
      expect(fakeDb.data).to.eq({});
      done();
    });
  });
});

