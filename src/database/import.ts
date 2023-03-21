import * as Chain from "stream-chain";
import * as clc from "colorette";
import * as Filter from "stream-json/filters/Filter";
import * as stream from "stream";
import * as StreamObject from "stream-json/streamers/StreamObject";

import { URL } from "url";
import { Client, ClientResponse } from "../apiv2";
import { FirebaseError } from "../error";
import * as pLimit from "p-limit";

const MAX_CHUNK_SIZE = 1024 * 1024 * 10;
const CONCURRENCY_LIMIT = 5;

type JsonType = { [key: string]: JsonType } | string | number | boolean;

type Data = {
  json: JsonType;
  pathname: string;
};

type ChunkedData = {
  chunks: Data[] | null;
  size: number;
};

/**
 * Imports JSON data to a given RTDB instance.
 *
 * The data is parsed and chunked into subtrees of ~10 MB, to be subsequently written in parallel.
 */
export default class DatabaseImporter {
  private client: Client;
  private limit = pLimit(CONCURRENCY_LIMIT);

  constructor(
    private dbUrl: URL,
    private inStream: stream.Readable,
    private dataPath: string,
    private chunkSize = MAX_CHUNK_SIZE
  ) {
    this.client = new Client({ urlPrefix: dbUrl.origin, auth: true });
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

  private readAndWriteChunks(): Promise<ClientResponse<JsonType>[]> {
    const { dbUrl } = this;
    const chunkData = this.chunkData.bind(this);
    const writeChunk = this.writeChunk.bind(this);
    const getJoinedPath = this.joinPath.bind(this);

    const readChunks = new stream.Transform({ objectMode: true });
    readChunks._transform = function (chunk: { key: string; value: JsonType }, _, done) {
      const data = { json: chunk.value, pathname: getJoinedPath(dbUrl.pathname, chunk.key) };
      const chunkedData = chunkData(data);
      const chunks = chunkedData.chunks || [data];
      for (const chunk of chunks) {
        this.push(chunk);
      }
      done();
    };

    const writeChunks = new stream.Transform({ objectMode: true });
    writeChunks._transform = async function (chunk: Data, _, done) {
      const res = await writeChunk(chunk);
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
        .pipe(writeChunks)
        .on("data", (res: ClientResponse<JsonType>) => responses.push(res))
        .on("error", reject)
        .once("end", () => resolve(responses));
    });
  }

  private writeChunk(chunk: Data): Promise<ClientResponse<JsonType>> {
    return this.limit(() =>
      this.client.request({
        method: "PUT",
        path: chunk.pathname + ".json",
        body: JSON.stringify(chunk.json),
        queryParams: this.dbUrl.searchParams,
      })
    );
  }

  private chunkData({ json, pathname }: Data): ChunkedData {
    if (typeof json === "string" || typeof json === "number" || typeof json === "boolean") {
      // Leaf node, cannot be chunked
      return { chunks: null, size: JSON.stringify(json).length };
    } else {
      // Children node
      let size = 2; // {}

      const chunks = [];
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
          chunks.push(child);
        }
      }

      if (hasChunkedChild || size >= this.chunkSize) {
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
