import * as clc from "colorette";
import * as stream from "stream";
import pLimit from "p-limit";

import { URL } from "url";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";

const JSONStream = require("JSONStream");

const MAX_CHUNK_SIZE = 1024 * 1024;
const CONCURRENCY_LIMIT = 5;

type Data = {
  json: { [key: string]: any } | string | number | boolean;
  pathname: string;
};

type ChunkedData = {
  chunks: Data[] | null;
  size: number;
};

/**
 * Imports JSON data to a given RTDB instance.
 *
 * The data is parsed and chunked into subtrees of ~1 MB, to be subsequently written in parallel.
 */
export default class DatabaseImporter {
  private jsonPath: string;
  private client: Client;
  private limit = pLimit(CONCURRENCY_LIMIT);

  constructor(
    private dbUrl: URL,
    private inStream: NodeJS.ReadableStream,
    dataPath: string,
    private chunkSize = MAX_CHUNK_SIZE
  ) {
    this.jsonPath = this.computeJsonPath(dataPath);
    this.client = new Client({ urlPrefix: dbUrl.origin, auth: true });
  }

  /**
   * Writes the chunked data to RTDB. Any existing data at the specified location will be overwritten.
   */
  async execute(): Promise<any> {
    await this.checkLocationIsEmpty();
    return this.readAndWriteChunks(this.inStream);
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

  private readAndWriteChunks(inStream: NodeJS.ReadableStream): Promise<any> {
    const { dbUrl } = this;
    const chunkData = this.chunkData.bind(this);
    const writeChunk = this.writeChunk.bind(this);
    const getJoinedPath = this.joinPath.bind(this);

    const readChunks = new stream.Transform({ objectMode: true });
    readChunks._transform = function (chunk: { key: string; value: any }, _, done) {
      const data = { json: chunk.value, pathname: getJoinedPath(dbUrl.pathname, chunk.key) };
      const chunkedData = chunkData(data);
      const chunks = chunkedData.chunks || [data];
      chunks.forEach((chunk: Data) => this.push(chunk));
      done();
    };

    const writeChunks = new stream.Transform({ objectMode: true });
    writeChunks._transform = async function (chunk: Data, _, done) {
      const res = await writeChunk(chunk);
      this.push(res);
      done();
    };

    return new Promise((resolve, reject) => {
      const responses: any[] = [];
      inStream
        .pipe(JSONStream.parse(this.jsonPath))
        .on("error", (err: any) =>
          reject(
            new FirebaseError("Invalid data; couldn't parse JSON object, array, or value.", {
              original: err,
              exit: 2,
            })
          )
        )
        .pipe(readChunks)
        .pipe(writeChunks)
        .on("data", (res: any) => responses.push(res))
        .on("error", reject)
        .once("end", () => resolve(responses));
    });
  }

  private writeChunk(chunk: Data): Promise<any> {
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

      for (const key of Object.keys(json)) {
        size += key.length + 3; // "":

        const child = { json: json[key], pathname: this.joinPath(pathname, key) };
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

  private computeJsonPath(dataPath: string): string {
    if (dataPath === "/") {
      return "$*";
    } else {
      return `${dataPath.split("/").slice(1).join(".")}.$*`;
    }
  }

  private joinPath(root: string, key: string): string {
    return [root, key].join("/").replace("//", "/");
  }
}
