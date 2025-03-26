// https://github.com/supabase-community/pg-gateway

import { DebugLevel, PGlite, PGliteOptions } from "@electric-sql/pglite";
// Unfortunately, we need to dynamically import the Postgres extensions.
// They are only available as ESM, and if we import them normally,
// our tsconfig will convert them to requires, which will cause errors
// during module resolution.
const { dynamicImport } = require(true && "../../dynamicImport");
import * as net from "node:net";
import * as fs from "fs";

import {
  getMessages,
  type PostgresConnection,
  FrontendMessageCode,
  BackendMessageCode,
} from "./pg-gateway/index";
import { fromNodeSocket } from "./pg-gateway/platforms/node";
import { logger } from "../../logger";
import { hasMessage, FirebaseError } from "../../error";
import { StringDecoder } from "node:string_decoder";

export const TRUNCATE_TABLES_SQL = `
DO $do$
DECLARE _clear text;
BEGIN
   SELECT 'TRUNCATE TABLE ' || string_agg(oid::regclass::text, ', ') || ' CASCADE'
    FROM   pg_class
    WHERE  relkind = 'r'
    AND    relnamespace = 'public'::regnamespace
   INTO _clear;
  EXECUTE COALESCE(_clear, 'select now()');
END
$do$;`;

export class PostgresServer {
  private dataDirectory?: string;
  private importPath?: string;
  private debug: DebugLevel;

  public db: PGlite | undefined = undefined;
  private server: net.Server | undefined = undefined;

  public async createPGServer(host: string = "127.0.0.1", port: number): Promise<net.Server> {
    const getDb = this.getDb.bind(this);

    const server = net.createServer(async (socket) => {
      const connection: PostgresConnection = await fromNodeSocket(socket, {
        serverVersion: "16.3 (PGlite 0.2.0)",
        auth: { method: "trust" },

        async onMessage(data: Uint8Array, { isAuthenticated }: { isAuthenticated: boolean }) {
          // Only forward messages to PGlite after authentication
          if (!isAuthenticated) {
            return;
          }
          const db = await getDb();
          if (data[0] === FrontendMessageCode.Terminate) {
            // When the frontend terminates a connection, throw out all prepared statements
            // because the next client won't know about them (and may create overlapping statements)
            await db.query("DEALLOCATE ALL");
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
    this.server = server;

    const listeningPromise = new Promise<void>((resolve) => {
      server.listen(port, host, () => {
        resolve();
      });
    });
    await listeningPromise;
    return server;
  }

  async getDb(): Promise<PGlite> {
    if (!this.db) {
      // First, ensure that the data directory exists - PGLite tries to do this but doesn't do so recursively
      if (this.dataDirectory && !fs.existsSync(this.dataDirectory)) {
        fs.mkdirSync(this.dataDirectory, { recursive: true });
      }
      // Not all schemas will need vector installed, but we don't have an good way
      // to swap extensions after starting PGLite, so we always include it.
      const vector = (await dynamicImport("@electric-sql/pglite/vector")).vector;
      const uuidOssp = (await dynamicImport("@electric-sql/pglite/contrib/uuid_ossp")).uuid_ossp;
      const pgliteArgs: PGliteOptions = {
        debug: this.debug,
        extensions: {
          vector,
          uuidOssp,
        },
        dataDir: this.dataDirectory,
      };
      if (this.importPath) {
        logger.debug(`Importing from ${this.importPath}`);
        const rf = fs.readFileSync(this.importPath);
        const file = new File([rf], this.importPath);
        pgliteArgs.loadDataDir = file;
      }
      this.db = await this.forceCreateDB(pgliteArgs);
      await this.db.waitReady;
    }
    return this.db;
  }

  public async clearDb(): Promise<void> {
    const db = await this.getDb();
    await db.query(TRUNCATE_TABLES_SQL);
  }

  public async exportData(exportPath: string): Promise<void> {
    const db = await this.getDb();
    const dump = await db.dumpDataDir();
    const arrayBuff = await dump.arrayBuffer();
    fs.writeFileSync(exportPath, new Uint8Array(arrayBuff));
  }

  async forceCreateDB(pgliteArgs: PGliteOptions): Promise<PGlite> {
    try {
      const db = await PGlite.create(pgliteArgs);
      return db;
    } catch (err: unknown) {
      if (pgliteArgs.dataDir && hasMessage(err) && /Database already exists/.test(err.message)) {
        // Clear out the current pglite data
        fs.rmSync(pgliteArgs.dataDir, { force: true, recursive: true });
        const db = await PGlite.create(pgliteArgs);
        return db;
      }
      logger.debug(`Error from pglite: ${err}`);
      throw new FirebaseError("Unexpected error starting up Postgres.");
    }
  }

  public async stop(): Promise<void> {
    if (this.db) {
      await this.db.close();
    }
    if (this.server) {
      this.server.close();
    }
    return;
  }

  constructor(args: { dataDirectory?: string; importPath?: string; debug?: boolean }) {
    this.dataDirectory = args.dataDirectory;
    this.importPath = args.importPath;
    this.debug = args.debug ? 5 : 0;
  }
}

// TODO: Remove this code once https://github.com/electric-sql/pglite/pull/294 is released in PGLite
export class PGliteExtendedQueryPatch {
  isExtendedQuery = false;
  eqpErrored = false;

  constructor(public connection: PostgresConnection) {}

  async *filterResponse(message: Uint8Array, response: Uint8Array) {
    // 'Parse' indicates the start of an extended query
    const pipelineStartMessages: number[] = [
      FrontendMessageCode.Parse,
      FrontendMessageCode.Bind,
      FrontendMessageCode.Close,
    ];
    const decoder = new StringDecoder();
    const decoded = decoder.write(message as any as Buffer);
    logger.debug(decoded);
    if (pipelineStartMessages.includes(message[0])) {
      this.isExtendedQuery = true;
    }

    // 'Sync' indicates the end of an extended query
    if (message[0] === FrontendMessageCode.Sync) {
      this.isExtendedQuery = false;
      this.eqpErrored = false;

      // Manually inject 'ReadyForQuery' message at the end
      return this.connection.createReadyForQuery();
    }

    // A PGlite response can contain multiple messages
    for await (const message of getMessages(response)) {
      // After an ErrorMessage in extended query protocol, we should throw away messages until the next Sync
      // (per https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY:~:text=When%20an%20error,for%20each%20Sync.))
      if (this.eqpErrored) {
        continue;
      }
      if (this.isExtendedQuery && message[0] === BackendMessageCode.ErrorMessage) {
        this.eqpErrored = true;
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
