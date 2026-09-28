import { expect } from "chai";
import { Readable } from "stream";

import { loadStreamJson } from "./streamJson";

function collect<T>(pipeline: NodeJS.ReadableStream): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const out: T[] = [];
    pipeline.on("data", (d: T) => out.push(d));
    pipeline.on("end", () => resolve(out));
    pipeline.on("error", reject);
  });
}

describe("loadStreamJson", () => {
  it("should load all helpers", async () => {
    const helpers = await loadStreamJson();

    for (const fn of Object.values(helpers)) {
      expect(fn).to.be.a("function");
    }
  });

  it("should return the same helpers on repeated calls", async () => {
    const [a, b] = await Promise.all([loadStreamJson(), loadStreamJson()]);

    expect(a).to.equal(b);
  });

  it("should stream object entries with parser, pick, and streamObject", async () => {
    const { chain, parser, pick, streamObject } = await loadStreamJson();

    const out = await collect<string>(
      chain([
        Readable.from(['{"name":"x","dependencies":{"next":{},"react":{}}}']),
        parser({ packValues: false, packKeys: true, streamValues: false }),
        pick({ filter: "dependencies" }),
        streamObject(),
        ({ key }: { key: string }) => key,
      ]),
    );

    expect(out).to.deep.equal(["next", "react"]);
  });

  it("should stream array entries with pick.withParser and streamArray", async () => {
    const { chain, pick, streamArray } = await loadStreamJson();

    const out = await collect<{ value: unknown }>(
      chain([
        Readable.from(['{"users":[{"localId":"1"},{"localId":"2"}]}']),
        pick.withParser({ filter: /^users$/ }),
        streamArray(),
      ]),
    );

    expect(out.map((o) => o.value)).to.deep.equal([{ localId: "1" }, { localId: "2" }]);
  });

  it("should filter paths with filter.withParser", async () => {
    const { chain, filter, streamObject } = await loadStreamJson();

    const out = await collect<{ key: string; value: unknown }>(
      chain([
        Readable.from(['{"a":{"b":1,"c":2},"z":3}']),
        filter.withParser({ filter: "a", pathSeparator: "/" }),
        streamObject(),
      ]),
    );

    expect(out).to.deep.equal([{ key: "a", value: { b: 1, c: 2 } }]);
  });
});
