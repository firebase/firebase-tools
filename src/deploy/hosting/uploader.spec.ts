import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as zlib from "zlib";
import { Uploader } from "./uploader";
import { Client } from "../../apiv2";
import * as hashcache from "./hashcache";
import { PassThrough, Readable } from "stream";

describe("deploy/hosting/uploader", () => {
  let clientPostStub: sinon.SinonStub;
  let clientRequestStub: sinon.SinonStub;

  class MockQueue<T> {
    public handler: (item: T) => Promise<void>;
    private promises: Promise<void>[] = [];
    constructor(options: { handler: (item: T) => Promise<void> }) {
      this.handler = options.handler;
    }
    add(item: T) {
      const p = Promise.resolve(this.handler(item));
      this.promises.push(p);
    }
    process() {
      // do nothing
    }
    async wait() {
      await Promise.all(this.promises);
      return Promise.resolve();
    }
    close() {
      // do nothing
    }
    stats() {
      return { total: 0, complete: 0, cursor: 0 };
    }
  }

  beforeEach(() => {
    sinon.stub(fs, "statSync");
    sinon.stub(fs, "createReadStream");
    sinon.stub(zlib, "createGzip");
    clientPostStub = sinon.stub(Client.prototype, "post");
    clientRequestStub = sinon.stub(Client.prototype, "request");
    sinon.stub(hashcache, "load").returns(new Map());
    sinon.stub(hashcache, "dump");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should initialize correctly", () => {
    const uploader = new Uploader({
      version: "v1",
      projectRoot: "root",
      files: ["file1.txt"],
      public: "public",
    });
    expect(uploader).to.be.instanceOf(Uploader);
  });

  it("should hash files and populate version", async () => {
    const uploader = new Uploader({
      version: "v1",
      projectRoot: "root",
      files: ["file1.txt", "file2.txt"],
      public: "public",
    });
    (uploader as any).hashQueue = new MockQueue({
      handler: (uploader as any).hashHandler.bind(uploader),
    });
    (uploader as any).populateQueue = new MockQueue({
      handler: (uploader as any).populateHandler.bind(uploader),
    });
    (uploader as any).uploadQueue = new MockQueue({
      handler: (uploader as any).uploadHandler.bind(uploader),
    });

    (fs.statSync as sinon.SinonStub).returns({ mtime: new Date(), size: 100 });

    // Mock stream for file1.txt
    const mockStream1 = new Readable({
      read() {
        this.push(Buffer.from("hash1"));
        this.push(null);
      },
    });
    // Mock stream for file2.txt
    const mockStream2 = new Readable({
      read() {
        this.push(Buffer.from("hash2"));
        this.push(null);
      },
    });

    (zlib.createGzip as sinon.SinonStub).callsFake(() => new PassThrough());
    (fs.createReadStream as sinon.SinonStub).callsFake((filePath: string) => {
      if (filePath.includes("file1.txt")) {
        return mockStream1;
      }
      if (filePath.includes("file2.txt")) {
        return mockStream2;
      }
      return new PassThrough();
    });

    clientPostStub.resolves({
      body: {
        uploadUrl: "https://upload.url",
        uploadRequiredHashes: [
          "af316ecb91a8ee7ae99210702b2d4758f30cdde3bf61e3d8e787d74681f90a6e", // hash for "hash1"
          "e7bf382f6e5915b3f88619b866223ebf1d51c4c5321cccde2e9ff700a3259086", // hash for "hash2"
        ],
      },
    });
    clientRequestStub.resolves({ status: 200, response: { text: sinon.stub().resolves("") } });

    await uploader.start();

    expect(clientPostStub.calledWithMatch(/\/v1:populateFiles/)).to.be.true;
    expect(clientPostStub.firstCall.args[1].files).to.have.property("/file1.txt");
    expect(clientPostStub.firstCall.args[1].files).to.have.property("/file2.txt");
    expect(clientRequestStub.calledTwice).to.be.true;
  });
});
