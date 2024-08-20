// https://github.com/supabase-community/pg-gateway

import { PGlite } from '@electric-sql/pglite';
// This is hideous, but I'm not trying to migrate to module: node16 as part of
// const { dynamicImport } = require(true && "../../dynamicImport");
import * as net from 'node:net';
import { BackendError, PostgresConnection } from './pgGateway';
export class PostgresServer {
  public callCount = 0;
  public db: PGlite;
  public async createPGServer(): Promise<net.Server> {
    const db: PGlite = this.db;
    await db.waitReady;
    const server = net.createServer(function(socket) {
      console.log("starting!");
      const connection = new PostgresConnection(socket, {
        // serverVersion: '16.3 (PGlite 0.2.0)', // TODO: What's the min version for pgvector support?
        authMode: 'none',

        // Validate user credentials based on auth mode chosen
        validateCredentials: async function() {
          return true;
        },

        // Hook into each client message
        async onMessage(data, { isAuthenticated }) {
          console.log("Got a message");
          // Only forward messages to PGlite after authentication
          if (!isAuthenticated) {
            console.log("WE ARE NOT AUTHENTICATED");
            return false;
          }
      
            // Forward raw message to PGlite
            try {
              const val = await db.execProtocolRaw(data);
              // const [[_, responseData]] = val;
              // const responseData = mergeArrays(val);
              connection.sendData(val);
            } catch (err) {
              console.log(`error is ${err}`);
              connection.sendError(err as BackendError);
              connection.sendReadyForQuery();
            }
            return true;
          // try {
          //   const res = await db.execProtocol(data);
          //   if (!res.length) {
          //     console.log("Seems like we're breaking here on describe statements?");
          //     // connection.sendData(new Uint8Array());
          //     const hc = await db.query("SELECT 'HELLO WORLD';");
          //     console.log(hc);
          //     return true;
          //   } else {

          //     console.log("But this works fine?");
          //     const [[br, responseData]] = res;
          //     connection.sendData(responseData);
          //   }
          // } catch (err) {
          //   console.log("error is", err);
          //   connection.sendError(err as BackendError);
          //   connection.sendReadyForQuery();
          // }
          // return true;
        },

        async onQuery(query, state) {

          try {
            const result = await db.query(query);
            console.log("Result is ", result);
            // const data = new Uint8Array(result);
            connection.sendData(result.blob);
          } catch (err) {
            console.log("error is", err);
            connection.sendError(err as BackendError);
            connection.sendReadyForQuery();
          }
          return new Uint8Array();
        }
      });

      socket.on('end', () => {
        console.log('Client disconnected');
      });
    });
    let listeningPromise = new Promise<void>((resolve, reject) => {
      server.listen(5432, "127.0.0.1", () => {
        console.log('opened server on', server.address());
        console.log(server.listening);
        resolve();
      });
    })
    await db.waitReady;
    await listeningPromise;

    return server;
  }


  constructor(database: string, username: string) {
    // const vector = dynamicImport('@electric-sql/pglite/vector');
    // const uuid_ossp = dynamicImport('@electric-sql/pglite/contrib/uuid_ossp');
    this.db = new PGlite({
    // dataDir?: string;
      username,
      database,
    // fs?: Filesystem;
    // debug: 5,
    // relaxedDurability?: boolean;
      extensions: {
        // vector,
        // uuid_ossp
      },
    // loadDataDir?: Blob | File;
    // initialMemory?: number;
    });
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