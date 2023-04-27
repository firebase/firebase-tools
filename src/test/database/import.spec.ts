import * as nock from "nock";
import * as stream from "stream";
import * as utils from "../../utils";
import { expect } from "chai";

import DatabaseImporter from "../../database/import";
import { FirebaseError } from "../../error";
import { FetchError } from "node-fetch";

const dbUrl = new URL("https://test-db.firebaseio.com/foo");
const chunkSize = 1024 * 1024 * 10;
const concurrencyLimit = 5;

describe("DatabaseImporter", () => {
  const DATA = { a: 100, b: [true, "bar", { f: { g: 0, h: 1 }, i: "baz" }] };
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
      chunkSize,
      concurrencyLimit
    );

    await expect(importer.execute()).to.be.rejectedWith(
      FirebaseError,
      "Invalid data; couldn't parse JSON object, array, or value."
    );
  });

  it("chunks data in top-level objects", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/a.json", "100").reply(200);
    nock("https://test-db.firebaseio.com")
      .put("/foo/b.json", JSON.stringify([true, "bar", { f: { g: 0, h: 1 }, i: "baz" }]))
      .reply(200);
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/",
      chunkSize,
      concurrencyLimit
    );

    const responses = await importer.execute();

    expect(responses).to.have.length(2);
    expect(nock.isDone()).to.be.true;
  });

  it("chunks data according to provided chunk size", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/a.json", "100").reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/b/0.json", "true").reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/b/1.json", '"bar"').reply(200);
    nock("https://test-db.firebaseio.com")
      .put("/foo/b/2/f.json", JSON.stringify({ g: 0, h: 1 }))
      .reply(200);
    nock("https://test-db.firebaseio.com").put("/foo/b/2/i.json", '"baz"').reply(200);
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/",
      /* chunkSize= */ 20,
      concurrencyLimit
    );

    const responses = await importer.execute();

    expect(responses).to.have.length(5);
    expect(nock.isDone()).to.be.true;
  });

  it("imports from data path", async () => {
    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com")
      .put("/foo/b.json", JSON.stringify([true, "bar", { f: { g: 0, h: 1 }, i: "baz" }]))
      .reply(200);
    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/b",
      chunkSize,
      concurrencyLimit
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
      chunkSize,
      concurrencyLimit
    );

    await expect(importer.execute()).to.be.rejectedWith(
      FirebaseError,
      /Importing is only allowed for an empty location./
    );
  });

  it("retries non-fatal connection timeout error", async () => {
    const timeoutErr = new FetchError("connect ETIMEDOUT", "system");
    timeoutErr.code = "ETIMEDOUT";

    nock("https://test-db.firebaseio.com").get("/foo.json?shallow=true").reply(200);
    nock("https://test-db.firebaseio.com")
      .put("/foo/a.json", "100")
      .once()
      .replyWithError(timeoutErr);
    nock("https://test-db.firebaseio.com").put("/foo/a.json", "100").once().reply(200);
    nock("https://test-db.firebaseio.com")
      .put("/foo/b.json", JSON.stringify([true, "bar", { f: { g: 0, h: 1 }, i: "baz" }]))
      .reply(200);

    const importer = new DatabaseImporter(
      dbUrl,
      DATA_STREAM,
      /* importPath= */ "/",
      chunkSize,
      concurrencyLimit
    );
    importer.nonFatalRetryTimeout = 0;

    const responses = await importer.execute();

    expect(responses).to.have.length(2);
    expect(nock.isDone()).to.be.true;
  });
});
