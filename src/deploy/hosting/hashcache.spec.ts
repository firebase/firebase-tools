import { expect } from "chai";
import fs from "fs-extra";
import { join } from "path";
import * as tmp from "tmp";

import { load, dump, HashRecord } from "./hashcache.js";

tmp.setGracefulCleanup();

describe("hashcache", () => {
  it("should return an empty object if a file doesn't exist", () => {
    expect(load("cwd-doesnt-exist", "somename")).to.deep.equal(new Map());
  });

  it("should be able to dump configuration to a file", () => {
    const dir = tmp.dirSync();
    const name = "testcache";
    const data = new Map<string, HashRecord>([["foo", { mtime: 0, hash: "deadbeef" }]]);

    expect(() => dump(dir.name, name, data)).to.not.throw();

    expect(fs.existsSync(join(dir.name, ".firebase", `hosting.${name}.cache`))).to.be.true;
    expect(fs.readFileSync(join(dir.name, ".firebase", `hosting.${name}.cache`), "utf8")).to.equal(
      "foo,0,deadbeef\n",
    );
  });

  it("should be able to load configuration from a file", () => {
    const dir = tmp.dirSync();
    const name = "testcache";
    fs.mkdirpSync(join(dir.name, ".firebase"));
    fs.writeFileSync(join(dir.name, ".firebase", `hosting.${name}.cache`), "bar,4,alivebeef\n");

    expect(load(dir.name, name)).to.deep.equal(
      new Map<string, HashRecord>([["bar", { mtime: 4, hash: "alivebeef" }]]),
    );
  });
});
