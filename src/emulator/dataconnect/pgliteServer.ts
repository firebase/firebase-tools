// https://github.com/supabase-community/pg-gateway

import { PGlite } from '@electric-sql/pglite';
// This is hideous, but I'm not trying to migrate to module: node16 as part of
const { dynamicImport } = require(true && "../../dynamicImport");
import * as net from 'node:net';
import { BackendError, PostgresConnection } from 'pg-gateway';
export class PostgresServer {
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
          console.log('handling a message!');
          console.log(data);
          console.log(data.toString())
                // Only forward messages to PGlite after authentication
          if (!isAuthenticated) {
            return false;
          }
          // Forward raw message to PGlite
          try {
            const res = await db.execProtocol(data);
            if (!res.length) {
              console.log("ITS EMPTYYYYYY");
              connection.sendData(new Uint8Array());
            } else {
              console.log(res);
              const [[br, responseData]] = res;
              console.log("responsedata", responseData);
              console.log("backend response", br);
              connection.sendData(responseData);
            }
          } catch (err) {
            console.log("error is", err);
            connection.sendError(err as BackendError);
            connection.sendReadyForQuery();
          }
          return true;
        },
      });

      console.log("made connection!");
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


  constructor(database: string) {
    const vector = dynamicImport('@electric-sql/pglite/vector');
    // const uuid_ossp = dynamicImport('@electric-sql/pglite/contrib/uuid_ossp');
    this.db = new PGlite({
    // dataDir?: string;
      database,
    // fs?: Filesystem;
    // debug?: DebugLevel;
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