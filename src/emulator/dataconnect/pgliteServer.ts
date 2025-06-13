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
} from "pg-gateway";
import { logger } from "../../logger";
import { hasMessage, FirebaseError } from "../../error";

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
      await fromNodeSocket(socket, {
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

          for await (const message of getMessages(response)) {
            yield message;
          }
        },
      });

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
      const pgliteArgs: PGliteOptions = {
        debug: this.debug,
        extensions: await this.getExtensions(),
        dataDir: this.dataDirectory,
      };
      if (this.importPath) {
        logger.debug(`Importing from ${this.importPath}`);
        const rf = fs.readFileSync(this.importPath) as unknown as BlobPart;
        const file = new File([rf], this.importPath);
        pgliteArgs.loadDataDir = file;
      }
      this.db = await this.forceCreateDB(pgliteArgs);
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
    if (!pgliteArgs.dataDir) {
      throw new FirebaseError("Cannot migrate database without a data directory.");
    }
    const dataDir = pgliteArgs.dataDir;

    // 1. Import old PGlite and pgDump
    const { PGlite: PGlite02 } = await dynamicImport("pglite-2");
    const pgDump = (await dynamicImport("@electric-sql/pglite-tools/pg_dump")).pgDump;

    // 2. Open old DB with old PGlite

    logger.info("Opening database with Postgres 16...");
    const extensions = await this.getExtensions();
    const oldDb = new PGlite02({ dataDir, extensions });
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

    // 4. Nuke old data directory
    logger.info("Removing old database directory...");
    fs.rmSync(dataDir, { force: true, recursive: true });

    // 5. Create new DB with new PGlite
    logger.info("Creating new database with Postgres 17...");
    const newDb = new PGlite(pgliteArgs);
    await newDb.waitReady;

    // 6. Import data
    logger.info("Importing data into new database...");
    const dumpText = await dumpResult.text();
    await newDb.exec(dumpText);
    await newDb.exec("SET SEARCH_PATH = public;");

    logger.info("Postgres database migration successful.");
    return newDb;
  }

  async forceCreateDB(pgliteArgs: PGliteOptions): Promise<PGlite> {
    if (pgliteArgs.dataDir && fs.existsSync(pgliteArgs.dataDir)) {
      const versionFilePath = path.join(pgliteArgs.dataDir, "PG_VERSION");
      if (fs.existsSync(versionFilePath)) {
        const version = fs.readFileSync(versionFilePath, "utf-8").trim();
        logger.debug(`Found Postgres version file with version: ${version}`);
        if (version === "16") {
          logger.info(
            "Detected a Postgres 16 data directory from an older version of firebase-tools. Migrating to Postgres 17...",
          );
          return this.migrateDb(pgliteArgs);
        }
      }
    }

    try {
      const db = new PGlite(pgliteArgs);
      await db.waitReady;
      return db;
    } catch (err: unknown) {
      if (pgliteArgs.dataDir && hasMessage(err) && /Database already exists/.test(err.message)) {
        // Clear out the current pglite data
        fs.rmSync(pgliteArgs.dataDir, { force: true, recursive: true });
        const db = new PGlite(pgliteArgs);
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
    this.dataDirectory = args.dataDirectory;
    this.importPath = args.importPath;
    this.debug = args.debug ? 5 : 0;
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
