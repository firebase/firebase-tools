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
    let buff = this.buff;
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
          let result = await db.execProtocolRaw(data);
          // if (incomingMessage.startsWith('P')) {
          //   const dec = td.decode(result);
          //   const trimmed = dec.replace("Z\u0000\u0000\u0000\u0005I", "");
          //   return te.encode(trimmed);
          // }
          // if (incomingMessage.startsWith('S')) {
          //   return te.encode("Z\u0000\u0000\u0000\u0005I");
          // }
          // // if (incomingMessage.startsWith('P') || incomingMessage.startsWith('D')) {
          // //   // PGlite behaves weirdly on Describe statements? Per (https://www.postgresql.org/docs/current/protocol-flow.html), it should respond with
          // //   // a ParameterDescription message follow by a RowDescription message.
          // //   // However, it actually responds with ParameterDescription, RowDescription, ReadyForQuery
          // //   // Let's try popping off that extra ReadyForQuery
          // //   const outgoing = td.decode(result);
          // //   console.log("Got a Prepare/Describe!");
          // //   const popped = outgoing.split("Z")[0];
          // //   const te = new TextEncoder();
          // //   return te.encode(popped);
          // // } else 
          // if (incomingMessage.startsWith('P') || incomingMessage.startsWith('D')) {
          //   buff.push(data)
          //   // connection.sendReadyForQuery();
          //   return "";
          // } else 
          // if(incomingMessage.startsWith('S')) {
          //   if (buff.length) {
          //     const res = await db.execProtocolRaw(mergeArrays(buff));
          //     while(buff.length) buff.pop();
          //     return res;
          //   }
          // }
          // else {
            return result;
          // }
          // try {
          //   const val = await db.execProtocol(data);
          //   const typesToSend: MessageName[] = ["dataRow", "emptyQuery", "parseComplete"];
          //   const v = val.find((v) => {
          //     console.log(v[0].name);
          //     return typesToSend.includes(v[0].name)
          //   })
          //   if (v) {
          //     connection.sendData(v[1]);
          //   }
          // } catch (err) {
          //   console.log(`error is ${err}`);
          //   connection.sendError(err as BackendError);
          //   connection.sendReadyForQuery();
          // }
          // return true;
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
