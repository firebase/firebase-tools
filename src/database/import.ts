import { URL } from "url";
import { Client } from "../apiv2";

const MAX_CHUNK_SIZE = 1024 * 1024;

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

  constructor(private dbUrl: URL, file: string, private chunkSize = MAX_CHUNK_SIZE) {
    const data = { json: JSON.parse(file), pathname: dbUrl.pathname };
    const chunkedData = this.chunkData(data);
    this.chunks = chunkedData.chunks || [data];
    this.client = new Client({ urlPrefix: dbUrl.origin, auth: true });
  }

  /**
   * Writes the chunked data to RTDB. Any existing data at the specified location will be overwritten.
   */
  async execute(): Promise<any> {
    return Promise.all(
      this.chunks.map((chunk: Data) =>
        this.client.request({
          method: "PUT",
          path: chunk.pathname + ".json",
          body: JSON.stringify(chunk.json),
          queryParams: this.dbUrl.searchParams,
        })
      )
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
