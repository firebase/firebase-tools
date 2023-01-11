import * as nock from "nock";
import { expect } from "chai";

import DatabaseImporter from "../../database/import";
import { FirebaseError } from "../../error";

const dbUrl = new URL("https://test-db.firebaseio.com/foo");

describe("DatabaseImporter", () => {
  const DATA = { a: 100, b: [true, "bar", { f: { g: 0, h: 1 }, i: "baz" }] };

  it("parses data as single chunk", () => {
    const importer = new DatabaseImporter(dbUrl, JSON.stringify(DATA));
    expect(importer.chunks.length).to.equal(1);
    expect(importer.chunks[0].json).to.deep.equal(DATA);
    expect(importer.chunks[0].pathname).to.equal("/foo");
  });

  it("parses data as multiple chunks", () => {
    const importer = new DatabaseImporter(dbUrl, JSON.stringify(DATA), /* chunkSize= */ 20);
    expect(importer.chunks.length).to.equal(5);
    expect(importer.chunks).to.deep.include({ json: 100, pathname: "/foo/a" });
    expect(importer.chunks).to.deep.include({ json: true, pathname: "/foo/b/0" });
    expect(importer.chunks).to.deep.include({ json: "bar", pathname: "/foo/b/1" });
    expect(importer.chunks).to.deep.include({ json: { g: 0, h: 1 }, pathname: "/foo/b/2/f" });
    expect(importer.chunks).to.deep.include({ json: "baz", pathname: "/foo/b/2/i" });
  });

  it("throws FirebaseError when JSON is invalid", () => {
    const INVALID_JSON = '{"a": }';
    expect(() => new DatabaseImporter(dbUrl, INVALID_JSON)).to.throw(
      FirebaseError,
      "Invalid data; couldn't parse JSON object, array, or value."
    );
  });

  it("sends multiple chunked requests", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/a.json", "100").reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/b/0.json", "true").reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/b/1.json", '"bar"').reply(200);
    nock("https://test-db.firebaseio.com")
      .put("/foo/b/2/f.json", JSON.stringify({ g: 0, h: 1 }))
      .reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/b/2/i.json", '"baz"').reply(200);

    const importer = new DatabaseImporter(dbUrl, JSON.stringify(DATA), /* chunkSize= */ 20);
    const responses = await importer.execute();
    expect(responses).to.have.length(5);
    expect(nock.isDone()).to.be.true;
  });

  it("throws FirebaseError when data location is nonempty", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200, { a: "foo" });
    const importer = new DatabaseImporter(dbUrl, JSON.stringify(DATA));
    await expect(importer.execute()).to.be.rejectedWith(
      FirebaseError,
      /Importing is only allowed for an empty location./
    );
  });
});
