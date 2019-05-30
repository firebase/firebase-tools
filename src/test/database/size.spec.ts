import { expect } from "chai";

import { DatabaseSize } from "../../database/size";
import { SizeRemote } from "../../database/sizeRemote";
import { FakeListRemote } from "./fakeListRemote.spec";
import { FakeSizeRemote } from "./fakeSizeRemote.spec";

describe("DatabaseSize", () => {
  it("should size tiny tree", async () => {
    const data = { c: 1 };
    const fakeSize = new FakeSizeRemote(data);
    const fakeList = new FakeListRemote(data);
    const sizeOp = new DatabaseSize("test-tiny-tree", "/");
    sizeOp.sizeRemote = fakeSize;
    sizeOp.listRemote = fakeList;

    const result: number = await sizeOp.execute();
    expect(result).to.be.below(Buffer.byteLength(JSON.stringify(data)));
    expect(result).to.be.above(0);
  });
  it("should size a medium tree", async () => {
    const data = {
      a: {
        b: {
          c: "d",
        },
      },
      e: {
        f: "g",
        h: "i",
      },
      j: "k",
    };
    const fakeSize = new FakeSizeRemote(data);
    const fakeList = new FakeListRemote(data);
    let sizeOp = new DatabaseSize("test-medium-tree-subtree", "/a");
    sizeOp.sizeRemote = fakeSize;
    sizeOp.listRemote = fakeList;
    const resulta: number = await sizeOp.execute();

    expect(resulta).to.be.below(Buffer.byteLength(JSON.stringify(data.a)));
    expect(resulta).to.be.above(0);

    sizeOp = new DatabaseSize("test-medium-tree", "/");
    sizeOp.sizeRemote = fakeSize;
    sizeOp.listRemote = fakeList;
    const result: number = await sizeOp.execute();

    expect(result).to.be.below(Buffer.byteLength(JSON.stringify(data)));
    expect(resulta).to.be.above(0);

    sizeOp = new DatabaseSize("test-medium-tree", "/a/b");
    sizeOp.sizeRemote = fakeSize;
    sizeOp.listRemote = fakeList;
    const resultab: number = await sizeOp.execute();

    /*
     * Sub-tree size should always be lower than any tree rooted at its ancestor
     * nodes.
     */
    expect(resulta).to.be.below(result);
    expect(resultab).to.be.below(resulta);
  });
});
