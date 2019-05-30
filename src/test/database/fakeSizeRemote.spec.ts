import * as pathLib from "path";
import { expect } from "chai";

import { SizeRemote, SizeResult } from "../../database/sizeRemote";

export class FakeSizeRemote implements SizeRemote {
  constructor(private data: any) {}

  async sizeNode(path: string, timeout: number): Promise<SizeResult> {
    return {
      success: true,
      bytes: this.size(this.dataAtPath(path)),
    };
  }

  private size(data: any): number {
    if (typeof data !== "object") {
      return Buffer.byteLength(data.toString());
    }
    return Buffer.byteLength(JSON.stringify(data));
  }

  private dataAtPath(path: string): any {
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

describe("FakeSizeRemote", () => {
  it("should return the correct size", async () => {
    const timeout = 5000;
    const data = {
      one: {
        digit: 1,
      },
      two: {
        digit: 2,
      },
      three: {
        digit: 3,
      },
      four: {
        digit: 4,
      },
      five: {
        digit: 5,
      },
      six: {
        digit: 6,
      },
    };
    const fakeSizer = new FakeSizeRemote(data);

    const rootSize = {
      success: true,
      bytes: Buffer.byteLength(JSON.stringify(data)),
    };
    await expect(fakeSizer.sizeNode("/", timeout)).to.eventually.eql(rootSize);
    const oneSize = {
      success: true,
      bytes: Buffer.byteLength(JSON.stringify(data.one)),
    };
    await expect(fakeSizer.sizeNode("/one", timeout)).to.eventually.eql(oneSize);

    const one = await fakeSizer.sizeNode("/one", timeout);
    const two = await fakeSizer.sizeNode("/two", timeout);
    const three = await fakeSizer.sizeNode("/three", timeout);
    const four = await fakeSizer.sizeNode("/four", timeout);
    const five = await fakeSizer.sizeNode("/five", timeout);
    const six = await fakeSizer.sizeNode("/six", timeout);

    const computedSize = {
      success: true,
      bytes: one.bytes + two.bytes + three.bytes + four.bytes + five.bytes + six.bytes + 47,
    };
    await expect(fakeSizer.sizeNode("/", timeout)).to.eventually.eql(computedSize);
  });
});
