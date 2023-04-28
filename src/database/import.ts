import * as Chain from "stream-chain";
import * as clc from "colorette";
import * as Filter from "stream-json/filters/Filter";
import * as stream from "stream";
import * as StreamObject from "stream-json/streamers/StreamObject";

import { URL } from "url";
import { Client, ClientResponse } from "../apiv2";
import { FetchError } from "node-fetch";
import { FirebaseError } from "../error";
import * as pLimit from "p-limit";

type JsonType = { [key: string]: JsonType } | string | number | boolean;

type Data = {
  json: JsonType;
  pathname: string;
};

type SizedData = Data & { size: number };

type ChunkedData = {
  chunks: SizedData[] | null;
  size: number;
};

/**
 * Batches chunked JSON data up to the specified byte size limit. The emitted batch is an object
 * containing chunks keyed by pathname.
 */
class BatchChunks extends stream.Transform {
  private batch: SizedData = { json: {}, pathname: "", size: 0 };

  constructor(private maxSize: number, opts?: stream.TransformOptions) {
    super({ ...opts, objectMode: true });
  }

  _transform(chunk: SizedData, _: BufferEncoding, callback: stream.TransformCallback): void {
    const totalChunkSize = chunk.size + chunk.pathname.length; // Overestimate
    if (this.batch.size + totalChunkSize > this.maxSize) {
      this.push(this.batch);
      this.batch = { json: {}, pathname: "", size: 0 };
    }
    if (this.batch.size === 0) {
      this.batch = chunk;
    } else {
      const newPathname = this._findLongestCommonPrefix(chunk.pathname, this.batch.pathname);
      const batchKey = this.batch.pathname.substring(newPathname.length + 1); // +1 to trim leading slash
      const chunkKey = chunk.pathname.substring(newPathname.length + 1);

      if (batchKey === "") {
        this.batch.json = Object.assign({}, this.batch.json, { [chunkKey]: chunk.json });
      } else if (chunkKey === "") {
        this.batch.json = Object.assign({}, chunk.json, { [batchKey]: this.batch.json });
      } else {
        this.batch.json = { [batchKey]: this.batch.json, [chunkKey]: chunk.json };
      }
      this.batch.pathname = newPathname;
    }
    this.batch.size += totalChunkSize;
    callback(null);
  }

  _findLongestCommonPrefix(a: string, b: string): string {
    const aTokens = a.split("/");
    const bTokens = b.split("/");
    let prefix = aTokens.slice(0, bTokens.length);
    for (let i = 0; i < prefix.length; i++) {
      if (prefix[i] !== bTokens[i]) {
        prefix = prefix.slice(0, i);
        break;
      }
    }
    return prefix.join("/");
  }

  _flush(callback: stream.TransformCallback) {
    if (this.batch.size > 0) {
      this.push(this.batch);
    }
    callback(null);
  }
}

/**
 * Imports JSON data to a given RTDB instance.
 *
 * The data is parsed and chunked into subtrees of the specified payload size, to be subsequently
 * written in parallel.
 */
export default class DatabaseImporter {
  private client: Client;
  private limit: pLimit.Limit;
  nonFatalRetryTimeout = 1000; // To be overriden in tests

  constructor(
    private dbUrl: URL,
    private inStream: stream.Readable,
    private dataPath: string,
    private payloadSize: number,
    concurrency: number
  ) {
    this.client = new Client({ urlPrefix: dbUrl.origin, auth: true });
    this.limit = pLimit(concurrency);
  }

  /**
   * Writes the chunked data to RTDB. Any existing data at the specified location will be overwritten.
   */
  async execute(): Promise<ClientResponse<JsonType>[]> {
    await this.checkLocationIsEmpty();
    return this.readAndWriteChunks();
  }

  private async checkLocationIsEmpty(): Promise<void> {
    const response = await this.client.request({
      method: "GET",
      path: this.dbUrl.pathname + ".json",
      queryParams: { shallow: "true" },
    });

    if (response.body) {
      throw new FirebaseError(
        "Importing is only allowed for an empty location. Delete all data by running " +
          clc.bold(`firebase database:remove ${this.dbUrl.pathname} --disable-triggers`) +
          ", then rerun this command.",
        { exit: 2 }
      );
    }
  }

  /**
   * The top-level objects are parsed and chunked, with each chunk capped at payloadSize. Then,
   * chunks are batched, with each batch also capped at payloadSize. Finally, the batched chunks
   * are written in parallel.
   *
   * In the case where the data contains very large objects, chunking ensures that the request is
   * not too large. On the other hand, in the case where the data contains many small objects,
   * batching ensures that there are not too many requests.
   */
  private readAndWriteChunks(): Promise<ClientResponse<JsonType>[]> {
    const { dbUrl, payloadSize } = this;
    const chunkData = this.chunkData.bind(this);
    const doWriteData = this.doWriteData.bind(this);
    const getJoinedPath = this.joinPath.bind(this);

    const readChunks = new stream.Transform({ objectMode: true });
    readChunks._transform = function (chunk: { key: string; value: JsonType }, _, done) {
      const data = { json: chunk.value, pathname: getJoinedPath(dbUrl.pathname, chunk.key) };
      const chunkedData = chunkData(data);
      const chunks = chunkedData.chunks || [{ ...data, size: JSON.stringify(data.json).length }];
      for (const chunk of chunks) {
        this.push(chunk);
      }
      done();
    };

    // Since we cannot PATCH primitives and arrays, we explicitly convert them to objects.
    const sanitizePatchData = new stream.Transform({ objectMode: true });
    sanitizePatchData._transform = function ({ json, pathname, size }: SizedData, _, done) {
      let sanitized: SizedData;
      if (typeof json === "string" || typeof json === "number" || typeof json === "boolean") {
        const tokens = pathname.split("/");
        const lastToken = tokens.pop();
        sanitized = { json: { [lastToken!]: json }, pathname: tokens.join("/"), size };
      } else if (Array.isArray(json)) {
        sanitized = { json: { ...json }, pathname, size };
      } else {
        sanitized = { json, pathname, size };
      }
      this.push(sanitized);
      done();
    };

    const writeData = new stream.Transform({ objectMode: true });
    writeData._transform = async function (data: SizedData, _, done) {
      const res = await doWriteData(data);
      this.push(res);
      done();
    };

    return new Promise((resolve, reject) => {
      const responses: ClientResponse<JsonType>[] = [];
      const pipeline = new Chain([
        this.inStream,
        Filter.withParser({
          filter: this.computeFilterString(this.dataPath) || (() => true),
          pathSeparator: "/",
        }),
        StreamObject.streamObject(),
      ]);
      pipeline
        .on("error", (err: Error) =>
          reject(
            new FirebaseError(
              `Invalid data; couldn't parse JSON object, array, or value. ${err.message}`,
              {
                original: err,
                exit: 2,
              }
            )
          )
        )
        .pipe(readChunks)
        .pipe(new BatchChunks(payloadSize))
        .pipe(sanitizePatchData)
        .pipe(writeData)
        .on("data", (res: ClientResponse<JsonType>) => responses.push(res))
        .on("error", reject)
        .once("end", () => resolve(responses));
    });
  }

  private doWriteData(data: SizedData): Promise<ClientResponse<JsonType>> {
    const doRequest = (): Promise<ClientResponse<JsonType>> => {
      return this.client.request({
        method: "PATCH",
        path: `${data.pathname}.json`,
        body: data.json,
        queryParams: this.dbUrl.searchParams,
      });
    };
    return this.limit(async () => {
      try {
        return await doRequest();
      } catch (err: any) {
        const isTimeoutErr =
          err instanceof FirebaseError &&
          err.original instanceof FetchError &&
          err.original.code === "ETIMEDOUT";
        if (isTimeoutErr) {
          // RTDB connection timeouts are transient and can be retried
          await new Promise((res) => setTimeout(res, this.nonFatalRetryTimeout));
          return await doRequest();
        }
        throw err;
      }
    });
  }

  private chunkData({ json, pathname }: Data): ChunkedData {
    if (typeof json === "string" || typeof json === "number" || typeof json === "boolean") {
      // Leaf node, cannot be chunked
      return { chunks: null, size: JSON.stringify(json).length };
    } else {
      // Children node
      let size = 2; // {}

      const chunks: SizedData[] = [];
      let hasChunkedChild = false;

      for (const [key, val] of Object.entries(json)) {
        size += key.length + 3; // "":

        const child = { json: val, pathname: this.joinPath(pathname, key) };
        const childChunks = this.chunkData(child);
        size += childChunks.size;
        if (childChunks.chunks) {
          hasChunkedChild = true;
          chunks.push(...childChunks.chunks);
        } else {
          chunks.push({ ...child, size: childChunks.size });
        }
      }

      if (hasChunkedChild || size >= this.payloadSize) {
        return { chunks, size };
      } else {
        return { chunks: null, size };
      }
    }
  }

  private computeFilterString(dataPath: string): string {
    return dataPath.split("/").filter(Boolean).join("/");
  }

  private joinPath(root: string, key: string): string {
    return [root, key].join("/").replace("//", "/");
  }
}
