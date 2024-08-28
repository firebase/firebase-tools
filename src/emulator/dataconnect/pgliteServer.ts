// https://github.com/supabase-community/pg-gateway

import { PGlite } from '@electric-sql/pglite';
// This is hideous, but I'm not trying to migrate to module: node16 as part of
// const { dynamicImport } = require(true && "../../dynamicImport");
import * as net from 'node:net';
import { PostgresConnection } from './pg-gateway';
export class PostgresServer {
  public callCount = 0;
  private username: string;
  private database: string;
  public db: PGlite | undefined;
  public async createPGServer(): Promise<net.Server> {
    const db: PGlite = await this.getDb();
    await db.waitReady;
    const server = net.createServer(function(socket) {
      console.log("starting!");
      const connection = new PostgresConnection(socket, {
        serverVersion: '16.3 (PGlite 0.2.0)', // TODO: What's the min version for pgvector support?
        auth: {method:"trust"},

        // Hook into each client message
        async onMessage(data, { isAuthenticated }) {
          // Only forward messages to PGlite after authentication
          if (!isAuthenticated) {
            console.log("WE ARE NOT AUTHENTICATED");
            return;
          }
          const td = new TextDecoder();
          console.log("Data is ", JSON.stringify(td.decode(data)));
          return await db.execProtocolRaw(data);
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

      socket.on('end', () => {
        console.log('Client disconnected');
      });
    });
    let listeningPromise = new Promise<void>((resolve, reject) => {
      server.listen(5432, "127.0.0.1", () => {
        resolve();
      });
    })
    await db.waitReady;
    await listeningPromise;

    return server;
  }

  async getDb(): Promise<PGlite> {
    if (this.db) {
      return this.db
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
      })
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
  let mergedArray = new Uint8Array(length);
  let offset = 0;
  for (const item of arrays) {
    mergedArray.set(item, offset);
    offset += item.length;
  }
  return mergedArray;
}