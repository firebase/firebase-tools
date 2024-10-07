// https://github.com/supabase-community/pg-gateway

import { PGlite } from "@electric-sql/pglite";
// Unfortunately, we need to dynamically import the Postgres extensions.
// They are only available as ESM, and if we import them normally,
// our tsconfig will convert them to requires, which will cause errors
// during module resolution.
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
  private username: string;
  private database: string;

  public db: PGlite | undefined;
  public async createPGServer(host: string = "127.0.0.1", port: number): Promise<net.Server> {
    const db: PGlite = await this.getDb();
    await db.waitReady;
    const server = net.createServer(async (socket) => {
      const connection: PostgresConnection = await fromNodeSocket(socket, {
        serverVersion: "16.3 (PGlite 0.2.0)",
        auth: { method: "trust" },

        async onMessage(data: Uint8Array, { isAuthenticated }: { isAuthenticated: boolean }) {
          // Only forward messages to PGlite after authentication
          if (!isAuthenticated) {
            return;
          }
          const result = await db.execProtocolRaw(data);
          // Extended query patch removes the extra Ready for Query messages that
          // pglite wrongly sends.
          return extendedQueryPatch.filterResponse(data, result);
        },
      });

      const extendedQueryPatch: PGliteExtendedQueryPatch = new PGliteExtendedQueryPatch(connection);

      socket.on("end", () => {
        logger.debug("Postgres client disconnected");
      });
      socket.on("error", (err) => {
        server.emit("error", err);
      });
    });
    const listeningPromise = new Promise<void>((resolve) => {
      server.listen(port, host, () => {
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
      username: this.username,
      database: this.database,
      debug: 0,
      extensions: {
        vector,
        uuidOssp,
      },
      // TODO:  Use dataDir + loadDataDir to implement import/export.
      // dataDir?: string;
      // loadDataDir?: Blob | File;
    });
  }

  constructor(database: string, username: string) {
    this.username = username;
    this.database = database;
  }
}

// TODO: Remove this code once https://github.com/electric-sql/pglite/pull/294 is released in PGLite
export class PGliteExtendedQueryPatch {
  isExtendedQuery = false;

  constructor(public connection: PostgresConnection) {}

  async *filterResponse(message: Uint8Array, response: Uint8Array) {
    // 'Parse' indicates the start of an extended query
    const pipelineStartMessages: number[] = [
      FrontendMessageCode.Parse,
      FrontendMessageCode.Bind,
      FrontendMessageCode.Close,
    ];

    if (pipelineStartMessages.includes(message[0])) {
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
      // If a prepared statement leads to an error message, we need to end the pipeline.
      if (message[0] === BackendMessageCode.ErrorMessage) {
        this.isExtendedQuery = false;
      }
      // Filter out incorrect `ReadyForQuery` messages during the extended query protocol
      if (this.isExtendedQuery && message[0] === BackendMessageCode.ReadyForQuery) {
        logger.debug("Filtered out a ReadyForQuery.");
        continue;
      }
      yield message;
    }
  }
}
