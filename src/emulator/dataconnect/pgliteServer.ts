// https://github.com/supabase-community/pg-gateway

import { PGlite } from "@electric-sql/pglite";
// This is hideous, but I'm not trying to migrate to module: node16 as part of
const { dynamicImport } = require(true && "../../dynamicImport");
import * as net from "node:net";
import {
  getMessages,
  type PostgresConnection,
  FrontendMessageCode,
  BackendMessageCode,
} from "./pg-gateway/index";
import { fromNodeSocket } from "./pg-gateway/platforms/node";
import { logger } from "../../logger";

export class PostgresServer {
  public callCount = 0;
  private username: string;
  private database: string;

  public db: PGlite | undefined;
  public async createPGServer(): Promise<net.Server> {
    const db: PGlite = await this.getDb();
    await db.waitReady;
    const server = net.createServer(async (socket) => {
      const connection: PostgresConnection = await fromNodeSocket(socket, {
        serverVersion: "16.3 (PGlite 0.2.0)",
        auth: { method: "trust" },

        // Hook into each client message
        // Issue - we are piping back way too many ready for queries
        async onMessage(data: Uint8Array, { isAuthenticated }: { isAuthenticated: boolean }) {
          // Only forward messages to PGlite after authentication
          if (!isAuthenticated) {
            return;
          }
          const result = await db.execProtocolRaw(data);
          return extendedQueryPatch.filterResponse(data, result);
        },
      });

      const extendedQueryPatch: PGliteExtendedQueryPatch = new PGliteExtendedQueryPatch(connection);

      socket.on("end", () => {
        logger.debug("Postgres client disconnected");
      });
    });
    const listeningPromise = new Promise<void>((resolve) => {
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
    // Not all schemas will need vector installed, but we don't have an good way
    // to swap extensions after starting PGLite, so we always include it.
    const vector = (await dynamicImport("@electric-sql/pglite/vector")).vector;
    const uuidOssp = (await dynamicImport("@electric-sql/pglite/contrib/uuid_ossp")).uuid_ossp;
    return PGlite.create({
      // dataDir?: string;
      username: this.username,
      database: this.database,
      // fs?: Filesystem;
      debug: 0,
      extensions: {
        vector,
        uuidOssp,
      },
      // loadDataDir?: Blob | File;
      // initialMemory?: number;
    });
  }

  constructor(database: string, username: string) {
    this.username = username;
    this.database = database;
  }
}

export class PGliteExtendedQueryPatch {
  isExtendedQuery = false;

  constructor(public connection: PostgresConnection) {}

  async *filterResponse(message: Uint8Array, response: Uint8Array) {
    // 'Parse' indicates the start of an extended query
    if (message[0] === FrontendMessageCode.Parse || message[0] === FrontendMessageCode.Bind) {
      this.isExtendedQuery = true;
    }

    // 'Sync' indicates the end of an extended query
    if (message[0] === FrontendMessageCode.Sync) {
      this.isExtendedQuery = false;

      // Manually inject 'ReadyForQuery' message at the end
      return this.connection.createReadyForQuery();
    }

    // A PGlite response can contain multiple messages
    for await (const message of getMessages(response)) {
      // Filter out incorrect `ReadyForQuery` messages during the extended query protocol
      if (this.isExtendedQuery && message[0] === BackendMessageCode.ReadyForQuery) {
        continue;
      }
      yield message;
    }
  }
}
