// https://github.com/supabase-community/pg-gateway

import { PGlite } from "@electric-sql/pglite";
// This is hideous, but I'm not trying to migrate to module: node16 as part of
// const { dynamicImport } = require(true && "../../dynamicImport");
import * as net from "node:net";
import { PostgresConnection } from "./pg-gateway";

export class PostgresServer {
  public callCount = 0;
  private username: string;
  private database: string;

  private buff: Uint8Array[] = [];

  public db: PGlite | undefined;
  public async createPGServer(): Promise<net.Server> {
    const db: PGlite = await this.getDb();
    await db.waitReady;
    const buff = this.buff;
    const server = net.createServer((socket) => {
      console.log("starting!");
      const connection = new PostgresConnection(socket, {
        serverVersion: "16.3 (PGlite 0.2.0)", // TODO: What's the min version for pgvector support?
        auth: { method: "trust" },

        // Hook into each client message
        // Issue - we are piping back way too many ready for queries
        async onMessage(data, { isAuthenticated }) {
          // Only forward messages to PGlite after authentication
          console.log("----------------------------------------------------------");
          if (!isAuthenticated) {
            console.log("WE ARE NOT AUTHENTICATED");
            return;
          }
          const td = new TextDecoder();
          const te = new TextEncoder();
          const incomingMessage = td.decode(data);
          console.log("Recieved message: ", incomingMessage);
          const result = await db.execProtocolRaw(data);
          if (incomingMessage.startsWith("P")) {
            // let results = await db.execProtocol(data);
            // console.log("~~~~~~")
            // for (const r of results) {
            //   console.log("-----BREAK-----")
            //   console.log(`${r[0].name} (${r[0].length})`)
            //   console.log(td.decode(r[1]));
            // }
            // console.log("~~~~~~")

            // TODO: Only do this if there is no error
            return te.encode("1\u0000\u0000\u0000\u0004");
          }
          if (incomingMessage.startsWith("B")) {
            // TODO: Only do this if there is no error
            return te.encode("2\u0000\u0000\u0000");
          }
          return result;
        },
      });

      socket.on("end", () => {
        console.log("Client disconnected");
      });
    });
    const listeningPromise = new Promise<void>((resolve, reject) => {
      server.listen(5432, "127.0.0.1", () => {
        resolve();
      });
    });
    await db.waitReady;
    await listeningPromise;

    return server;
  }

  async getDb(): Promise<PGlite> {
    if (this.db) {
      return this.db;
    }
    return PGlite.create({
      // dataDir?: string;
      username: this.username,
      database: this.database,
      // fs?: Filesystem;
      debug: 0,
      // relaxedDurability?: boolean;
      extensions: {
        // vector,
        // uuid_ossp
      },
      // loadDataDir?: Blob | File;
      // initialMemory?: number;
    });
  }

  constructor(database: string, username: string) {
    // const vector = dynamicImport('@electric-sql/pglite/vector');
    // const uuid_ossp = dynamicImport('@electric-sql/pglite/contrib/uuid_ossp');
    this.username = username;
    this.database = database;
  }
}

function mergeArrays(arrays: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const item of arrays) {
    length += item.length;
  }
  // Create a new array with total length and merge all source arrays.
  const mergedArray = new Uint8Array(length);
  let offset = 0;
  for (const item of arrays) {
    mergedArray.set(item, offset);
    offset += item.length;
  }
  return mergedArray;
}
