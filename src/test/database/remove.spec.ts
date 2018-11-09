import { expect } from "chai";
import * as pathLib from "path";

import DatabaseRemove from "../../database/remove";
import { NodeSize, RemoveRemote } from "../../database/removeRemote";

class TestRemoveRemote implements RemoveRemote {
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

  public prefetchTest(path: string): Promise<NodeSize> {
    const d = this._dataAtpath(path);
    if (!d) {
      return Promise.resolve(NodeSize.EMPTY);
    }
    if ("string" === typeof d) {
      return Promise.resolve(NodeSize.SMALL);
    } else if (Object.keys(d).length === 0) {
      return Promise.resolve(NodeSize.EMPTY);
    } else {
      return Promise.resolve(NodeSize.LARGE);
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
        if (typeof d === "string") {
          d = null;
        } else {
          d = d[p];
        }
      }
    }
    return d;
  }
}

describe("TestRemoveRemote", () => {
  const fakeDb = new TestRemoveRemote({
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
    return expect(fakeDb.listPath("/")).to.eventually.eql(["a", "d", "f"]);
  });

  it("prefetchTest should return empty", () => {
    return expect(fakeDb.prefetchTest("/f")).to.eventually.eql(NodeSize.EMPTY);
  });

  it("prefetchTest should return large", () => {
    return expect(fakeDb.prefetchTest("/")).to.eventually.eql(NodeSize.LARGE);
  });

  it("prefetchTest should return small", () => {
    return expect(fakeDb.prefetchTest("/d/e")).to.eventually.eql(NodeSize.SMALL);
  });

  it("deletePath should work", () => {
    return fakeDb.deletePath("/a/b").then(() => {
      return expect(fakeDb.listPath("/a")).to.eventually.eql(["c"]);
    });
  });
});

describe("DatabaseRemove", () => {
  it("DatabaseRemove should remove fakeDb at / 1", () => {
    const fakeDb = new TestRemoveRemote({
      c: "2",
    });
    const removeOps = new DatabaseRemove("/", {
      instance: "test-remover",
      concurrency: 200,
      retries: 5,
    });
    removeOps.remote = fakeDb;
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql(null);
    });
  });

  it("DatabaseRemove should remove fakeDb at / 2", () => {
    const fakeDb = new TestRemoveRemote({
      a: {
        b: { x: { y: "1" } },
        c: "2",
      },
      d: {
        e: "3",
      },
    });
    const removeOps = new DatabaseRemove("/", {
      instance: "test-remover",
      concurrency: 200,
      retries: 5,
    });
    removeOps.remote = fakeDb;
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql(null);
    });
  });

  it("DatabaseRemove should remove fakeDb at /a/b", () => {
    const fakeDb = new TestRemoveRemote({
      a: {
        b: { x: { y: "1" } },
        c: "2",
      },
      d: {
        e: "3",
      },
    });

    const removeOps = new DatabaseRemove("/a/b", {
      instance: "test-remover",
      concurrency: 200,
      retries: 5,
    });
    removeOps.remote = fakeDb;
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
    const fakeDb = new TestRemoveRemote({
      a: {
        b: { x: { y: "1" } },
        c: "2",
      },
      d: {
        e: "3",
      },
    });
    const removeOps = new DatabaseRemove("/a", {
      instance: "test-remover",
      concurrency: 200,
      retries: 5,
    });
    removeOps.remote = fakeDb;
    return removeOps.execute().then(() => {
      expect(fakeDb.data).to.eql({
        d: {
          e: "3",
        },
      });
    });
  });
});
