"use strict";
// https://github.com/supabase-community/pg-gateway
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PGliteExtendedQueryPatch = exports.fromNodeSocket = exports.PostgresServer = exports.TRUNCATE_TABLES_SQL = void 0;
const pglite_1 = require("@electric-sql/pglite");
// Unfortunately, we need to dynamically import the Postgres extensions.
// They are only available as ESM, and if we import them normally,
// our tsconfig will convert them to requires, which will cause errors
// during module resolution.
const { dynamicImport } = require(true && "../../dynamicImport");
const net = __importStar(require("node:net"));
const node_stream_1 = require("node:stream");
const fs = __importStar(require("fs"));
const path = __importStar(require("node:path"));
const pg_gateway_1 = require("pg-gateway");
const logger_1 = require("../../logger");
const error_1 = require("../../error");
const fsutils_1 = require("../../fsutils");
const node_string_decoder_1 = require("node:string_decoder");
exports.TRUNCATE_TABLES_SQL = `
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
const decoder = new node_string_decoder_1.StringDecoder();
class PostgresServer {
    async createPGServer(host = "127.0.0.1", port) {
        const getDb = this.getDb.bind(this);
        const server = net.createServer(async (socket) => {
            const connection = await fromNodeSocket(socket, {
                serverVersion: "17.4 (PGlite 0.3.3)",
                auth: { method: "trust" },
                async *onMessage(data, { isAuthenticated }) {
                    // Only forward messages to PGlite after authentication
                    if (!isAuthenticated) {
                        return;
                    }
                    const db = await getDb();
                    if (data[0] === pg_gateway_1.FrontendMessageCode.Terminate) {
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
            const extendedQueryPatch = new PGliteExtendedQueryPatch(connection);
            socket.on("end", () => {
                logger_1.logger.debug("Postgres client disconnected");
            });
            socket.on("error", (err) => {
                server.emit("error", err);
            });
        });
        this.server = server;
        const listeningPromise = new Promise((resolve) => {
            server.listen(port, host, () => {
                resolve();
            });
        });
        await listeningPromise;
        return server;
    }
    async getDb() {
        if (!this.db) {
            this.db = await this.forceCreateDB();
        }
        return this.db;
    }
    async getExtensions() {
        const vector = (await dynamicImport("@electric-sql/pglite/vector")).vector;
        const uuidOssp = (await dynamicImport("@electric-sql/pglite/contrib/uuid_ossp")).uuid_ossp;
        return { vector, uuidOssp };
    }
    async clearDb() {
        const db = await this.getDb();
        await db.query(exports.TRUNCATE_TABLES_SQL);
    }
    async exportData(exportPath) {
        const db = await this.getDb();
        const dump = await db.dumpDataDir();
        const arrayBuff = await dump.arrayBuffer();
        fs.writeFileSync(exportPath, new Uint8Array(arrayBuff));
    }
    async migrateDb(pgliteArgs) {
        if (!this.baseDataDirectory) {
            throw new error_1.FirebaseError("Cannot migrate database without a data directory.");
        }
        // 1. Import old PGlite and pgDump
        const { PGlite: PGlite02 } = await dynamicImport("pglite-2");
        const pgDump = (await dynamicImport("@electric-sql/pglite-tools/pg_dump")).pgDump;
        // 2. Open old DB with old PGlite
        logger_1.logger.info("Opening database with Postgres 16...");
        const extensions = await this.getExtensions();
        const dataDir = this.baseDataDirectory;
        const oldDb = new PGlite02({ ...pgliteArgs, dataDir });
        await oldDb.waitReady;
        const oldVersion = await oldDb.query("SELECT version();");
        logger_1.logger.debug(`Old database version: ${oldVersion.rows[0].version}`);
        if (!oldVersion.rows[0].version.includes("PostgreSQL 16")) {
            await oldDb.close();
            throw new error_1.FirebaseError("Migration started, but DB version is not PostgreSQL 16.");
        }
        // 3. Dump data
        logger_1.logger.info("Dumping data from old database...");
        const dumpDir = await oldDb.dumpDataDir("none");
        const tempOldDb = await PGlite02.create({
            loadDataDir: dumpDir,
            extensions,
        });
        const dumpResult = await pgDump({ pg: tempOldDb, args: ["--verbose", "--verbose"] });
        await tempOldDb.close();
        await oldDb.close();
        // 4. Move old dataDir to pg16 directory
        logger_1.logger.info(`Moving old database directory to ${this.baseDataDirectory}/pg16...`);
        const pg16Dir = this.getVersionedDataDir(16);
        (0, fsutils_1.moveAll)(this.baseDataDirectory, pg16Dir);
        logger_1.logger.info("If you need to use an older version of the Firebase CLI, you can restore from that directory.");
        // 5. Create new DB with new PGlite
        logger_1.logger.info("Creating new database with Postgres 17...");
        const pg17Dir = this.getVersionedDataDir(17);
        const newDb = new pglite_1.PGlite({ ...pgliteArgs, dataDir: pg17Dir });
        await newDb.waitReady;
        // 6. Import data
        logger_1.logger.info("Importing data into new database...");
        const dumpText = await dumpResult.text();
        await newDb.exec(dumpText);
        await newDb.exec("SET SEARCH_PATH = public;");
        logger_1.logger.info("Postgres database migration successful.");
        return newDb;
    }
    // When we upgrade Postgres versions, we need to migrate old data. To make this simpler,
    // we started using versioned subdirectories of the dataDir.
    // Note that we did not do this originally, so PG16 data is often found in the baseDataDir
    getVersionedDataDir(version) {
        if (!this.baseDataDirectory) {
            return;
        }
        return path.join(this.baseDataDirectory, `pg${version}`);
    }
    async forceCreateDB() {
        const baseArgs = {
            debug: this.debug,
            extensions: await this.getExtensions(),
        };
        const pg17Dir = this.getVersionedDataDir(17);
        // First, ensure that the data directory exists - PGLite tries to do this but doesn't do so recursively
        if (pg17Dir && !fs.existsSync(pg17Dir)) {
            fs.mkdirSync(pg17Dir, { recursive: true });
        }
        if (this.importPath) {
            logger_1.logger.debug(`Importing from ${this.importPath}`);
            const rf = fs.readFileSync(this.importPath);
            const file = new File([rf], this.importPath);
            baseArgs.loadDataDir = file;
        }
        // Detect and handle migration from older versions. Originally, we did not do versioned subdirectories,
        // so we just check the base directory here
        if (this.baseDataDirectory && fs.existsSync(this.baseDataDirectory)) {
            const versionFilePath = path.join(this.baseDataDirectory, "PG_VERSION");
            if (fs.existsSync(versionFilePath)) {
                const version = fs.readFileSync(versionFilePath, "utf-8").trim();
                logger_1.logger.debug(`Found Postgres version file with version: ${version}`);
                if (version === "16") {
                    logger_1.logger.info("Detected a Postgres 16 data directory from an older version of firebase-tools. Migrating to Postgres 17...");
                    return this.migrateDb(baseArgs);
                }
            }
        }
        try {
            const db = new pglite_1.PGlite({ ...baseArgs, dataDir: pg17Dir });
            await db.waitReady;
            return db;
        }
        catch (err) {
            if (pg17Dir && (0, error_1.hasMessage)(err) && /Database already exists/.test(err.message)) {
                // Clear out the current pglite data
                fs.rmSync(pg17Dir, { force: true, recursive: true });
                const db = new pglite_1.PGlite({ ...baseArgs, dataDir: pg17Dir });
                await db.waitReady;
                return db;
            }
            logger_1.logger.warn(`Error from pglite: ${err}`);
            throw new error_1.FirebaseError("Unexpected error starting up Postgres.");
        }
    }
    async stop() {
        if (this.db) {
            await this.db.close();
        }
        if (this.server) {
            this.server.close();
        }
        return;
    }
    constructor(args) {
        this.db = undefined;
        this.server = undefined;
        this.baseDataDirectory = args.dataDirectory;
        this.importPath = args.importPath;
        this.debug = args.debug ? 1 : 0;
    }
}
exports.PostgresServer = PostgresServer;
/**
 * Creates a `PostgresConnection` from a Node.js TCP/Unix `Socket`.
 *
 * `PostgresConnection` operates on web streams, so this helper
 * converts a `Socket` to/from the respective web streams.
 *
 * Also implements `upgradeTls()`, which makes Postgres `SSLRequest`
 * upgrades available in Node.js environments.
 */
async function fromNodeSocket(socket, options) {
    const rs = node_stream_1.Readable.toWeb(socket);
    const ws = node_stream_1.Writable.toWeb(socket);
    const opts = options
        ? {
            ...options,
        }
        : undefined;
    return new pg_gateway_1.PostgresConnection({ readable: rs, writable: ws }, opts);
}
exports.fromNodeSocket = fromNodeSocket;
class PGliteExtendedQueryPatch {
    constructor(connection) {
        this.connection = connection;
        this.isExtendedQuery = false;
        this.eqpErrored = false;
        this.pgliteDebugLog = fs.createWriteStream("pglite-debug.log");
    }
    async *filterResponse(message, response) {
        // 'Parse' indicates the start of an extended query
        const pipelineStartMessages = [
            pg_gateway_1.FrontendMessageCode.Parse,
            pg_gateway_1.FrontendMessageCode.Bind,
            pg_gateway_1.FrontendMessageCode.Close,
        ];
        const decoded = decoder.write(message);
        this.pgliteDebugLog.write("Front: " + decoded);
        if (pipelineStartMessages.includes(message[0])) {
            this.isExtendedQuery = true;
        }
        // 'Sync' indicates the end of an extended query
        if (message[0] === pg_gateway_1.FrontendMessageCode.Sync) {
            this.isExtendedQuery = false;
            this.eqpErrored = false;
        }
        // A PGlite response can contain multiple messages
        for await (const bm of (0, pg_gateway_1.getMessages)(response)) {
            // After an ErrorMessage in extended query protocol, we should throw away messages until the next Sync
            // (per https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY:~:text=When%20an%20error,for%20each%20Sync.))
            if (this.eqpErrored) {
                continue;
            }
            if (this.isExtendedQuery && bm[0] === pg_gateway_1.BackendMessageCode.ErrorMessage) {
                this.eqpErrored = true;
            }
            // Filter out incorrect `ReadyForQuery` messages during the extended query protocol
            if (this.isExtendedQuery && bm[0] === pg_gateway_1.BackendMessageCode.ReadyForQuery) {
                this.pgliteDebugLog.write("Filtered: " + decoder.write(bm));
                continue;
            }
            this.pgliteDebugLog.write("Sent: " + decoder.write(bm));
            yield bm;
        }
    }
}
exports.PGliteExtendedQueryPatch = PGliteExtendedQueryPatch;
//# sourceMappingURL=pgliteServer.js.map