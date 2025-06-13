// https://github.com/supabase-community/pg-gateway

import { DebugLevel, PGlite, PGliteOptions } from "@electric-sql/pglite";
import { PGlite as pglite2, PGliteOptions as pgliteOpts2 } from "pglite-02";

// Unfortunately, we need to dynamically import the Postgres extensions.
// They are only available as ESM, and if we import them normally,
// our tsconfig will convert them to requires, which will cause errors
// during module resolution.
const { dynamicImport } = require(true && "../../dynamicImport");
import * as net from "node:net";
import { Readable, Writable } from "node:stream";
import * as fs from "fs";

import {
  getMessages,
  PostgresConnection,
  type PostgresConnectionOptions,
  FrontendMessageCode,
} from "pg-gateway";
import { logger } from "../../logger";
import { hasMessage, FirebaseError } from "../../error";

import * as path from 'path';
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

const currentPostgresVersion = 17;

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
      const pgliteArgs: PGliteOptions = {
        debug: this.debug,
        extensions: await this.getExtensions(),
        dataDir: this.dataDirectory,
      };
      let migrationSql: string = "";
      // First, ensure that the data directory exists - PGLite tries to do this but doesn't do so recursively
      if (this.dataDirectory) {
        const dataDirVersion = checkDataDirPGVersion(this.dataDirectory)
        if (dataDirVersion && dataDirVersion !== `${currentPostgresVersion}`) {
          console.log('Dumping migration sql');
          migrationSql  = await this.migrateOldDataDir(pgliteArgs);
          console.log(migrationSql)
        }

        if (!fs.existsSync(this.dataDirectory)) {
          fs.mkdirSync(this.dataDirectory, { recursive: true });
        }
      }
      
      if (this.importPath) {
        logger.debug(`Importing from ${this.importPath}`);
        pgliteArgs.loadDataDir = importHelper(this.importPath);
      }
      this.db = await this.forceCreateDB(pgliteArgs);
      if (migrationSql) {
        await this.db.exec(migrationSql);
      }
    }
    return this.db;
  }

  private async getExtensions() {
    // Not all schemas will need vector installed, but we don't have an good way
    // to swap extensions after starting PGLite, so we always include it.
    const vector = (await dynamicImport("@electric-sql/pglite/vector")).vector;
    const uuidOssp = (await dynamicImport("@electric-sql/pglite/contrib/uuid_ossp")).uuid_ossp;
    return { vector, uuidOssp }
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

  private async migrateOldDataDir(args: PGliteOptions): Promise<string> {
    if (!args.dataDir) {
      throw new FirebaseError('Tried to migrate nonexistant data directory')
    }
    logger.info("Detected a Postgres 16 data directory from an older version of firebase-tools. Migrating to Postgres 17.")
    const tempPath = `${args.dataDir}.old`;
    fs.cpSync(args.dataDir, tempPath, {recursive: true});
    fs.rmSync(args.dataDir, {recursive: true, force: true});
    const oldArgs: pgliteOpts2 = {
      extensions: args.extensions,
      dataDir: tempPath,
      debug: this.debug,
    }
    const oldDb = await pglite2.create(oldArgs);
    const res = await oldDb.exec("SELECT pg_catalog.set_config('search_path', '', false);");
    console.log(res);
    const pgDump = (await dynamicImport("@electric-sql/pglite-tools/pg_dump")).pgDump;
    console.log(pgDump);
    const dump = await pgDump({ pg: oldDb, args:["--verbose", "--verbose"] });
    return await dump.text();
  }

  constructor(args: { dataDirectory?: string; importPath?: string; debug?: boolean }) {
    this.dataDirectory = args.dataDirectory;
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


function checkDataDirPGVersion(dataDir: string): string | undefined {
  const versionFile = path.join(dataDir, "PG_VERSION");
  if (!fs.existsSync(versionFile)) {
    return
  }
  const version = fs.readFileSync(versionFile, "utf-8");
  return version;
}

function importHelper(importPath: string) {
  const rf = fs.readFileSync(importPath) as unknown as BlobPart;
  return new File([rf], importPath);
}