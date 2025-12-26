// https://github.com/supabase-community/pg-gateway

import { DebugLevel, PGlite, PGliteOptions } from "@electric-sql/pglite";
// Unfortunately, we need to dynamically import the Postgres extensions.
// They are only available as ESM, and if we import them normally,
// our tsconfig will convert them to requires, which will cause errors
// during module resolution.
const { dynamicImport } = require(true && "../../dynamicImport");
import * as net from "node:net";
import { Readable, Writable } from "node:stream";
import * as fs from "fs";
import * as path from "node:path";

import {
  getMessages,
  PostgresConnection,
  type PostgresConnectionOptions,
  FrontendMessageCode,
  BackendMessageCode,
} from "pg-gateway";
import { logger } from "../../logger";
import { hasMessage, FirebaseError } from "../../error";
import { moveAll } from "../../fsutils";
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

const decoder = new StringDecoder();

export class PostgresServer {
  private baseDataDirectory?: string;
  private importPath?: string;
  private debug: DebugLevel;

  public db: PGlite | undefined = undefined;
  private server: net.Server | undefined = undefined;

  public async createPGServer(host: string = "127.0.0.1", port: number): Promise<net.Server> {
    const getDb = this.getDb.bind(this);

    const server = net.createServer(async (socket) => {
      const connection = await fromNodeSocket(socket, {
        serverVersion: "17.4 (PGlite 0.3.3)",
        auth: { method: "trust" },

        async *onMessage(data: Uint8Array, { isAuthenticated }: { isAuthenticated: boolean }) {
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
          const response = await db.execProtocolRaw(data);
          for await (const message of extendedQueryPatch.filterResponse(data, response)) {
            yield message;
          }

          // Extended query patch removes the extra Ready for Query messages that
          // pglite wrongly sends.
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
      this.db = await this.forceCreateDB();
    }
    return this.db;
  }

  private async getExtensions() {
    const vector = (await dynamicImport("@electric-sql/pglite/vector")).vector;
    const uuidOssp = (await dynamicImport("@electric-sql/pglite/contrib/uuid_ossp")).uuid_ossp;
    return { vector, uuidOssp };
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

  private async migrateDb(pgliteArgs: PGliteOptions): Promise<PGlite> {
    if (!this.baseDataDirectory) {
      throw new FirebaseError("Cannot migrate database without a data directory.");
    }

    // 1. Import old PGlite and pgDump
    const { PGlite: PGlite02 } = await dynamicImport("pglite-2");
    const pgDump = (await dynamicImport("@electric-sql/pglite-tools/pg_dump")).pgDump;

    // 2. Open old DB with old PGlite

    logger.info("Opening database with Postgres 16...");
    const extensions = await this.getExtensions();
    const dataDir = this.baseDataDirectory;
    const oldDb = new PGlite02({ ...pgliteArgs, dataDir });
    await oldDb.waitReady;

    const oldVersion = await (oldDb as PGlite).query<{ version: string }>("SELECT version();");
    logger.debug(`Old database version: ${oldVersion.rows[0].version}`);
    if (!oldVersion.rows[0].version.includes("PostgreSQL 16")) {
      await oldDb.close();
      throw new FirebaseError("Migration started, but DB version is not PostgreSQL 16.");
    }

    // 3. Dump data
    logger.info("Dumping data from old database...");
    const dumpDir = await oldDb.dumpDataDir("none");
    const tempOldDb = await PGlite02.create({
      loadDataDir: dumpDir,
      extensions,
    });

    const dumpResult = await pgDump({ pg: tempOldDb, args: ["--verbose", "--verbose"] });
    await tempOldDb.close();
    await oldDb.close();

    // 4. Move old dataDir to pg16 directory
    logger.info(`Moving old database directory to ${this.baseDataDirectory}/pg16...`);
    const pg16Dir = this.getVersionedDataDir(16)!;
    moveAll(this.baseDataDirectory, pg16Dir);
    logger.info(
      "If you need to use an older version of the Firebase CLI, you can restore from that directory.",
    );

    // 5. Create new DB with new PGlite
    logger.info("Creating new database with Postgres 17...");
    const pg17Dir = this.getVersionedDataDir(17)!;
    const newDb = new PGlite({ ...pgliteArgs, dataDir: pg17Dir });
    await newDb.waitReady;

    // 6. Import data
    logger.info("Importing data into new database...");
    const dumpText = await dumpResult.text();
    await newDb.exec(dumpText);
    await newDb.exec("SET SEARCH_PATH = public;");

    logger.info("Postgres database migration successful.");
    return newDb;
  }

  // When we upgrade Postgres versions, we need to migrate old data. To make this simpler,
  // we started using versioned subdirectories of the dataDir.
  // Note that we did not do this originally, so PG16 data is often found in the baseDataDir
  private getVersionedDataDir(version: number): string | undefined {
    if (!this.baseDataDirectory) {
      return;
    }
    return path.join(this.baseDataDirectory, `pg${version}`);
  }

  async forceCreateDB(): Promise<PGlite> {
    const baseArgs: PGliteOptions = {
      debug: this.debug,
      extensions: await this.getExtensions(),
    };

    const pg17Dir = this.getVersionedDataDir(17);
    // First, ensure that the data directory exists - PGLite tries to do this but doesn't do so recursively
    if (pg17Dir && !fs.existsSync(pg17Dir)) {
      fs.mkdirSync(pg17Dir, { recursive: true });
    }

    if (this.importPath) {
      logger.debug(`Importing from ${this.importPath}`);
      const rf = fs.readFileSync(this.importPath) as unknown as BlobPart;
      const file = new File([rf], this.importPath);
      baseArgs.loadDataDir = file;
    }

    // Detect and handle migration from older versions. Originally, we did not do versioned subdirectories,
    // so we just check the base directory here
    if (this.baseDataDirectory && fs.existsSync(this.baseDataDirectory)) {
      const versionFilePath = path.join(this.baseDataDirectory, "PG_VERSION");
      if (fs.existsSync(versionFilePath)) {
        const version = fs.readFileSync(versionFilePath, "utf-8").trim();
        logger.debug(`Found Postgres version file with version: ${version}`);
        if (version === "16") {
          logger.info(
            "Detected a Postgres 16 data directory from an older version of firebase-tools. Migrating to Postgres 17...",
          );
          return this.migrateDb(baseArgs);
        }
      }
    }

    try {
      const db = new PGlite({ ...baseArgs, dataDir: pg17Dir });
      await db.waitReady;
      return db;
    } catch (err: unknown) {
      if (pg17Dir && hasMessage(err) && /Database already exists/.test(err.message)) {
        // Clear out the current pglite data
        fs.rmSync(pg17Dir, { force: true, recursive: true });
        const db = new PGlite({ ...baseArgs, dataDir: pg17Dir });
        await db.waitReady;
        return db;
      }
      logger.warn(`Error from pglite: ${err}`);
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
    this.baseDataDirectory = args.dataDirectory;
    this.importPath = args.importPath;
    this.debug = args.debug ? 1 : 0;
  }
}

/**
 * Creates a `PostgresConnection` from a Node.js TCP/Unix `Socket`.
 *
 * `PostgresConnection` operates on web streams, so this helper
 * converts a `Socket` to/from the respective web streams.
 *
 * Also implements `upgradeTls()`, which makes Postgres `SSLRequest`
 * upgrades available in Node.js environments.
 */
export async function fromNodeSocket(socket: net.Socket, options?: PostgresConnectionOptions) {
  const rs = Readable.toWeb(socket) as unknown as ReadableStream;
  const ws = Writable.toWeb(socket);
  const opts = options
    ? {
        ...options,
      }
    : undefined;

  return new PostgresConnection({ readable: rs, writable: ws }, opts);
}

export class PGliteExtendedQueryPatch {
  pgliteDebugLog: fs.WriteStream;

  constructor(public connection: PostgresConnection) {
    this.pgliteDebugLog = fs.createWriteStream("pglite-debug.log");
  }

  async *filterResponse(request: Uint8Array, response: Uint8Array) {
    this.pgliteDebugLog.write(
      `\n[-> ${getFrontendMessageCodeName(request[0])}] ` + decoder.write(request as any as Buffer),
    );

    // const isExtendedQuery =
    //   request[0] === FrontendMessageCode.Parse || request[0] === FrontendMessageCode.Bind;
    // let hasError = false;
    // let hasReadyForQuery = false;

    // 'Sync' indicates the end of an extended query
    // if (request[0] === FrontendMessageCode.Sync) {
    //   this.isExtendedQuery = false;
    //   this.extendedQueryErrored = false;
    // }

    // A PGlite response can contain multiple messages
    // https://www.postgresql.org/docs/current/protocol-message-formats.html
    for await (const bm of getMessages(response)) {
      // After an ErrorMessage in extended query protocol, we should throw away messages until the next Sync
      // (per https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY:~:text=When%20an%20error,for%20each%20Sync.))
      // if (this.eqpErrored) {
      //   this.pgliteDebugLog.write(
      //     `\n[<- ${getBackendMessageCodeName(bm[0])} (skipped)] ${decodedResp}`,
      //   );
      //   continue;
      // }
      // if (bm[0] === BackendMessageCode.ErrorMessage) {
      //   hasError = true;
      // }
      // if (bm[0] === BackendMessageCode.ReadyForQuery) {
      //   hasReadyForQuery = true;
      // }
      // Filter out incorrect `ReadyForQuery` messages during the extended query protocol
      // if (this.isExtendedQuery && bm[0] === BackendMessageCode.ReadyForQuery) {
      //   this.pgliteDebugLog.write(
      //     `\n[<- ${getBackendMessageCodeName(bm[0])} (skipped)] ${decodedResp}`,
      //   );
      //   continue;
      // }
      this.pgliteDebugLog.write(
        `\n[<- ${getBackendMessageCodeName(bm[0])}] ${decoder.write(bm as any as Buffer)}`,
      );
      yield bm;
    }
    // if (isExtendedQuery && hasError && !hasReadyForQuery) {
    //   const bm = new Uint8Array([BackendMessageCode.ReadyForQuery, 0, 0, 0, 5, 73]); // 'I' = Idle
    //   yield bm;
    //   this.pgliteDebugLog.write(
    //     `\n[<- ${getBackendMessageCodeName(bm[0])} extra] ${decoder.write(bm as any as Buffer)}`,
    //   );
    // }
  }
}

const REVERSE_FRONTEND_MESSAGE_CODE: Record<number, string> = {};
for (const key in FrontendMessageCode) {
  REVERSE_FRONTEND_MESSAGE_CODE[FrontendMessageCode[key as keyof typeof FrontendMessageCode]] = key;
}

const REVERSE_BACKEND_MESSAGE_CODE: Record<number, string> = {};
for (const key in BackendMessageCode) {
  REVERSE_BACKEND_MESSAGE_CODE[BackendMessageCode[key as keyof typeof BackendMessageCode]] = key;
}

function getFrontendMessageCodeName(code: number): string {
  return REVERSE_FRONTEND_MESSAGE_CODE[code] || `UNKNOWN_FRONTEND_CODE_${code}`;
}

function getBackendMessageCodeName(code: number): string {
  return REVERSE_BACKEND_MESSAGE_CODE[code] || `UNKNOWN_BACKEND_CODE_${code}`;
}
