import * as nock from "nock";
import * as stream from "stream";
import * as utils from "../../utils";
import { expect } from "chai";

import DatabaseImporter from "../../database/import";
import { FirebaseError } from "../../error";
import { FetchError } from "node-fetch";

const dbUrl = new URL("https://test-db.firebaseio.com/foo");
const payloadSize = 1024 * 1024 * 10;
const concurrencyLimit = 5;

describe("DatabaseImporter", () => {
  const DATA = { a: 100, b: [true, "bar", { f: { g: 0, h: 1 }, i: "baz" }], c: { d: false } };
  let DATA_STREAM: stream.Readable;

  beforeEach(() => {
    DATA_STREAM = utils.stringToStream(JSON.stringify(DATA))!;
  });

  it("throws FirebaseError when JSON is invalid", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    const INVALID_JSON = '{"a": {"b"}}';
    const importer = new DatabaseImporter(
      dbUrl,
      utils.stringToStream(INVALID_JSON)!,
      /* importPath= */ "/",
      payloadSize,
      concurrencyLimit,
    );

    await expect(importer.execute()).to.be.rejectedWith(
      FirebaseError,
      "Invalid data; couldn't parse JSON object, array, or value.",
    );
  });

  it("batches data from different top-level objects", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com")
      .patch("/foo.json", JSON.stringify({ a: 100, "b/0": true, "b/1": "bar" }))
      .reply(200);
    nock("https://test-db.firebaseio.com")
      .patch("/foo/b/2.json", JSON.stringify({ f: { g: 0, h: 1 }, i: "baz" }))
      .reply(200);
    nock("https://test-db.firebaseio.com")
      .patch("/foo/c.json", JSON.stringify({ d: false }))
      .reply(200);
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/",
      /* payloadSize= */ 40,
      concurrencyLimit,
    );

    const responses = await importer.execute();

    expect(responses).to.have.length(3);
    expect(nock.isDone()).to.be.true;
  });

  it("writes data as a single batch for large enough payload size", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com")
      .patch(
        "/foo.json",
        JSON.stringify({
          a: 100,
          b: [true, "bar", { f: { g: 0, h: 1 }, i: "baz" }],
          c: { d: false },
        }),
      )
      .reply(200);
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/",
      payloadSize,
      concurrencyLimit,
    );

    const responses = await importer.execute();

    expect(responses).to.have.length(1);
    expect(nock.isDone()).to.be.true;
  });

  it("imports from data path", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com")
      .patch("/foo/c.json", JSON.stringify({ d: false }))
      .reply(200);
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/c",
      payloadSize,
      concurrencyLimit,
    );

    const responses = await importer.execute();

    expect(responses).to.have.length(1);
    expect(nock.isDone()).to.be.true;
  });

  it("writes primitive as object", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com")
      .patch("/foo.json", JSON.stringify({ a: 100 }))
      .reply(200);
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/a",
      payloadSize,
      concurrencyLimit,
    );

    const responses = await importer.execute();

    expect(responses).to.have.length(1);
    expect(nock.isDone()).to.be.true;
  });

  it("writes array as object", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com")
      .patch(
        "/foo/b.json",
        JSON.stringify({ "0": true, "1": "bar", "2": { f: { g: 0, h: 1 }, i: "baz" } }),
      )
      .reply(200);
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/b",
      payloadSize,
      concurrencyLimit,
    );

    const responses = await importer.execute();

    expect(responses).to.have.length(1);
    expect(nock.isDone()).to.be.true;
  });

  it("throws FirebaseError when data location is nonempty", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200, { a: "foo" });
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/",
      payloadSize,
      concurrencyLimit,
    );

    await expect(importer.execute()).to.be.rejectedWith(
      FirebaseError,
      /Importing is only allowed for an empty location./,
    );
  });

  it("retries non-fatal connection timeout error", async () => {
    const timeoutErr = new FetchError("connect ETIMEDOUT", "system");
    timeoutErr.code = "ETIMEDOUT";

    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com")
      .patch(
        "/foo.json",
        JSON.stringify({
          a: 100,
          b: [true, "bar", { f: { g: 0, h: 1 }, i: "baz" }],
          c: { d: false },
        }),
      )
      .once()
      .replyWithError(timeoutErr);
    nock("https://test-db.firebaseio.com")
      .patch(
        "/foo.json",
        JSON.stringify({
          a: 100,
          b: [true, "bar", { f: { g: 0, h: 1 }, i: "baz" }],
          c: { d: false },
        }),
      )
      .once()
      .reply(200);

    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/",
      payloadSize,
      concurrencyLimit,
    );
    importer.nonFatalRetryTimeout = 0;

    const responses = await importer.execute();

    expect(responses).to.have.length(1);
    expect(nock.isDone()).to.be.true;
  });
});
