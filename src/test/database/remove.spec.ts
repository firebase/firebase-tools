import { expect } from "chai";
import * as pathLib from "path";

import DatabaseRemove from "../../database/remove";
import { RemoveRemote } from "../../database/removeRemote";

class TestRemoveRemote implements RemoveRemote {
  data: any;
  largeThreshold: number;

  constructor(data: any, largeThreshold: number = 10) {
    this.data = data;
    this.largeThreshold = largeThreshold;
  }

  listPath(path: string, numChildren: number): Promise<string[]> {
    const d = this._dataAtpath(path);
    if (d) {
      let keys = Object.keys(d);
      return Promise.resolve(keys.slice(0, numChildren));
    }
    return Promise.resolve([]);
  }

  deletePath(path: string): Promise<boolean> {
    const d = this._dataAtpath(path);
    let size = this._size(d);
    if (size > this.largeThreshold) {
      return Promise.resolve(false);
    }
    this._deletePath(path);
    return Promise.resolve(true);
  }

  deleteSubPath(path: string, children: string[]): Promise<boolean> {
    const d = this._dataAtpath(path);
    let size = 0;
    for (const child of children) {
      size += this._size(d[child]);
    }
    if (size > this.largeThreshold) {
      return Promise.resolve(false);
    }
    for (const child of children) {
      this.deletePath(`${path}/${child}`);
    }
    return Promise.resolve(true);
  }

  private _deletePath(path: string): void {
    if (path === "/") {
      this.data = null;
      return;
    }
    const parentDir = pathLib.dirname(path);
    const basename = pathLib.basename(path);
    delete this._dataAtpath(parentDir)[basename];
    if (Object.keys(this._dataAtpath(parentDir)).length === 0) {
      return this._deletePath(parentDir);
    }
  }

  private _size(data: any): number {
    if (typeof data === "number") {
      return data;
    }
    let size = 0;
    for (const key of Object.keys(data)) {
      size += this._size(data[key]);
    }
    return size;
  }

  private _dataAtpath(path: string): any {
    const splitedPath = path.slice(1).split("/");
    let d = this.data;
    for (const p of splitedPath) {
      if (d && p !== "") {
        if (typeof d === "number") {
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
  it("should return numChildren subpaths", async () => {
    const fakeDb = new TestRemoveRemote({ 1: 1, 2: 2, 3: 3, 4: 4 });
    await expect(fakeDb.listPath("/", 4)).to.eventually.eql(["1", "2", "3", "4"]);
    await expect(fakeDb.listPath("/", 3)).to.eventually.eql(["1", "2", "3"]);
    await expect(fakeDb.listPath("/", 2)).to.eventually.eql(["1", "2"]);
    await expect(fakeDb.listPath("/", 1)).to.eventually.eql(["1"]);
  });

  it("should failed to delete large path /", async () => {
    const data = { 1: 11 };
    const fakeDb = new TestRemoveRemote(data);
    await expect(fakeDb.deletePath("/")).to.eventually.eql(false);
    expect(fakeDb.data).eql(data);
  });

  it("should sucessfully delete large path /", async () => {
    const fakeDb = new TestRemoveRemote({ 1: 9 });
    await expect(fakeDb.deletePath("/")).to.eventually.eql(true);
    expect(fakeDb.data).eql(null);
  });

  it("should failed to delete large path /1", async () => {
    const data = { 1: { a: 3, b: 9, c: 2, d: 3 } };
    const fakeDb = new TestRemoveRemote(data);
    await expect(fakeDb.deletePath("/1")).to.eventually.eql(false);
    expect(fakeDb.data).eql(data);
  });

  it("should successfully delete path /1/a", async () => {
    const fakeDb = new TestRemoveRemote({ 1: { a: 3, b: 9, c: 2, d: 3 } });
    await expect(fakeDb.deletePath("/1/a")).to.eventually.eql(true);
    expect(fakeDb.data).eql({ 1: { b: 9, c: 2, d: 3 } });
  });

  it("should failed to delete large paths /1/a /1/b", async () => {
    const data = { 1: { a: 3, b: 9, c: 2, d: 3 } };
    const fakeDb = new TestRemoveRemote(data);
    await expect(fakeDb.deleteSubPath("/1", ["a", "b"])).to.eventually.eql(false);
    expect(fakeDb.data).eql(data);
  });

  it("should successfully delete multi paths /1/c /1/d", async () => {
    const fakeDb = new TestRemoveRemote({ 1: { a: 3, b: 9, c: 2, d: 3 } });
    await expect(fakeDb.deleteSubPath("/1", ["c", "d"])).to.eventually.eql(true);
    expect(fakeDb.data).eql({ 1: { a: 3, b: 9 } });
  });
});

describe("DatabaseRemove", () => {
  it("should remove tiny tree", async () => {
    const fakeDb = new TestRemoveRemote({ c: 1 });
    const removeOps = new DatabaseRemove("test-tiny-tree", "/");
    removeOps.remote = fakeDb;
    await removeOps.execute();
    expect(fakeDb.data).to.eql(null);
  });

  it("should remove subtree at /a/b/c", async () => {
    const fakeDb = new TestRemoveRemote({
      a: {
        b: { x: { y: 1 } },
        c: { x: 4, y: 8 },
        d: 10,
      },
      d: {
        e: 3,
      },
    });
    const removeOps = new DatabaseRemove("test-sub-path", "/a");
    removeOps.remote = fakeDb;
    await removeOps.execute();
    expect(fakeDb.data).to.eql({
      d: {
        e: 3,
      },
    });
  });

  function buildData(branchFactor: number, depth: number) {
    if (depth === 0) {
      return 1;
    }
    const d: any = {};
    for (let i = 0; i < branchFactor; i++) {
      d[`${i}`] = buildData(branchFactor, depth - 1);
    }
    return d;
  }
  function databaseRemoveTestSuit(threshold: number) {
    describe(`DatabaseRemove when threshold=${threshold}`, () => {
      it("should remove nested tree", async () => {
        const fakeDb = new TestRemoveRemote(buildData(3, 5), threshold);
        const removeOps = new DatabaseRemove("test-nested-tree", "/");
        removeOps.remote = fakeDb;
        await removeOps.execute();
        expect(fakeDb.data).to.eql(null);
      });

      it("should remove flat tree when threshold=${threshold}", async () => {
        const fakeDb = new TestRemoveRemote(buildData(1232, 1), threshold);
        const removeOps = new DatabaseRemove("test-remover", "/");
        removeOps.remote = fakeDb;
        await removeOps.execute();
        expect(fakeDb.data).to.eql(null);
      });
    });
  }
  databaseRemoveTestSuit(100);
  databaseRemoveTestSuit(10);
  databaseRemoveTestSuit(1);
});
