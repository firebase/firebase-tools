import * as clc from "colorette";
import pLimit from "p-limit";
import { URL } from "url";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";

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
  chunks: Data[];
  private client: Client;
  private limit = pLimit(CONCURRENCY_LIMIT);

  constructor(private dbUrl: URL, file: string, private chunkSize = MAX_CHUNK_SIZE) {
    let data;
    try {
      data = { json: JSON.parse(file), pathname: dbUrl.pathname };
    } catch (err: any) {
      throw new FirebaseError("Invalid data; couldn't parse JSON object, array, or value.", {
        original: err,
        exit: 2,
      });
    }

    const chunkedData = this.chunkData(data);
    this.chunks = chunkedData.chunks || [data];
    this.client = new Client({ urlPrefix: dbUrl.origin, auth: true });
  }

  /**
   * Writes the chunked data to RTDB. Any existing data at the specified location will be overwritten.
   */
  async execute(): Promise<any> {
    await this.checkLocationIsEmpty();
    return Promise.all(this.chunks.map(this.writeChunk.bind(this)));
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
        size += key.length + 3; // "[key]":

        const child = { json: json[key], pathname: [pathname, key].join("/").replace("//", "/") };
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
}
