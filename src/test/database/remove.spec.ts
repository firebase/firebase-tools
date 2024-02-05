import { expect } from "chai";

import DatabaseRemove from "../../database/remove";
import { FakeRemoveRemote } from "./fakeRemoveRemote.spec";
import { FakeListRemote } from "./fakeListRemote.spec";
const HOST = "https://firebaseio.com";

describe("DatabaseRemove", () => {
  it("should remove tiny tree", async () => {
    const fakeDb = new FakeRemoveRemote({ c: 1 });
    const removeOps = new DatabaseRemove("test-tiny-tree", "/", HOST, /* disableTriggers= */ false);
    removeOps.remote = fakeDb;
    await removeOps.execute();
    expect(fakeDb.data).to.eql(null);
  });

  it("should remove subtree at /a/b/c", async () => {
    const data = {
      a: {
        b: { x: { y: 1 } },
        c: { x: 4, y: 8 },
        d: 10,
      },
      d: {
        e: 3,
      },
    };

    const fakeList = new FakeListRemote(data);
    const fakeDb = new FakeRemoveRemote(data);

    const removeOps = new DatabaseRemove("test-sub-path", "/a", HOST, /* disableTriggers= */ false);
    removeOps.remote = fakeDb;
    removeOps.listRemote = fakeList;
    await removeOps.execute();
    expect(fakeDb.data).to.eql({
      d: {
        e: 3,
      },
    });
  });

  function buildData(branchFactor: number, depth: number): any {
    if (depth === 0) {
      return 1;
    }
    const d: any = {};
    for (let i = 0; i < branchFactor; i++) {
      d[`${i}`] = buildData(branchFactor, depth - 1);
    }
    return d;
  }

  function databaseRemoveTestSuit(threshold: number): void {
    describe(`DatabaseRemove when largeThreshold=${threshold}`, () => {
      it("should remove nested tree", async () => {
        const data = buildData(3, 5);
        const fakeDb = new FakeRemoveRemote(data, threshold);
        const fakeLister = new FakeListRemote(data);
        const removeOps = new DatabaseRemove(
          "test-nested-tree",
          "/",
          HOST,
          /* disableTriggers= */ false,
        );
        removeOps.remote = fakeDb;
        removeOps.listRemote = fakeLister;
        await removeOps.execute();
        expect(fakeDb.data).to.eql(null);
      });

      it("should remove flat tree when threshold=${threshold}", async () => {
        const data = buildData(1232, 1);
        const fakeDb = new FakeRemoveRemote(data, threshold);
        const fakeList = new FakeListRemote(data);
        const removeOps = new DatabaseRemove(
          "test-remover",
          "/",
          HOST,
          /* disableTriggers= */ false,
        );
        removeOps.remote = fakeDb;
        removeOps.listRemote = fakeList;
        await removeOps.execute();
        expect(fakeDb.data).to.eql(null);
      });
    });
  }

  databaseRemoveTestSuit(100);
  databaseRemoveTestSuit(10);
  databaseRemoveTestSuit(1);
});
