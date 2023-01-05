import { URL } from "url";
import { Client } from "./apiv2";
import * as utils from "./utils";

const MAX_CHUNK_SIZE = 1024 * 1024;

type Data = {
  json: any;
  pathname: string;
};

type ChunkedData = {
  chunks: Data[] | null;
  size: number;
};

export class DatabaseChunkUploader {
  private client: Client;
  private chunks: Data[];

  constructor(private dbUrl: URL, file: string) {
    this.client = new Client({ urlPrefix: dbUrl.origin, auth: true });

    const data = { json: JSON.parse(file), pathname: dbUrl.pathname };
    const chunkedData = this.chunkData(data);
    this.chunks = chunkedData.chunks || [data];
  }

  public async upload(overwrite: boolean): Promise<any> {
    return Promise.all(
      this.chunks.map((chunk: Data) =>
        this.client.request({
          method: overwrite ? "PUT" : "PATCH",
          path: chunk.pathname + ".json",
          body: JSON.stringify(chunk.json),
          queryParams: this.dbUrl.searchParams,
        })
      )
    );
  }

  private chunkData({ json, pathname }: Data): ChunkedData {
    if (isObject(json)) {
      // Children node
      let size = 2; // {}
      let chunks = [];
      let hasChunkedChild = false;

      for (const key in json) {
        size += key.length + 3; // "[key]":

        const child = { json: json[key], pathname: pathname + "/" + key };
        const childChunks = this.chunkData(child);
        size += childChunks.size;
        if (childChunks.chunks) {
          hasChunkedChild = true;
          chunks.push(...childChunks.chunks);
        } else {
          chunks.push(child);
        }
      }

      if (hasChunkedChild || size >= MAX_CHUNK_SIZE) {
        return { chunks, size };
      } else {
        return { chunks: null, size };
      }
    } else {
      // Leaf node, cannot be chunked
      return { chunks: null, size: JSON.stringify(json).length };
    }
  }
}

function isObject(blob: any): boolean {
  return blob !== null && typeof blob === "object";
}
