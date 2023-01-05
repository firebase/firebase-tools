import { expect } from "chai";

import DatabaseImporter from "../../database/import";

const dbUrl = new URL("https://test-db.firebaseio.com/foo");

describe("DatabaseImporter", () => {
  const DATA = { a: 100, b: { c: true, d: { e: "bar", f: { g: 0, h: 1 } } } };

  it("parses data as single chunk", () => {
    const importer = new DatabaseImporter(dbUrl, JSON.stringify(DATA));
    expect(importer.chunks.length).to.equal(1);
    expect(importer.chunks[0].json).to.deep.equal(DATA);
    expect(importer.chunks[0].pathname).to.equal("/foo");
  });

  it("parses data as multiple chunks", () => {
    const importer = new DatabaseImporter(dbUrl, JSON.stringify(DATA), /* chunkSize= */ 20);
    expect(importer.chunks.length).to.equal(4);
    expect(importer.chunks).to.deep.include({ json: 100, pathname: "/foo/a" });
    expect(importer.chunks).to.deep.include({ json: true, pathname: "/foo/b/c" });
    expect(importer.chunks).to.deep.include({ json: "bar", pathname: "/foo/b/d/e" });
    expect(importer.chunks).to.deep.include({ json: { g: 0, h: 1 }, pathname: "/foo/b/d/f" });
  });
});
