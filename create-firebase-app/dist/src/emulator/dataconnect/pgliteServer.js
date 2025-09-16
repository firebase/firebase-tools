"use strict";
// https://github.com/supabase-community/pg-gateway
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PGliteExtendedQueryPatch = exports.fromNodeSocket = exports.PostgresServer = exports.TRUNCATE_TABLES_SQL = void 0;
const pglite_1 = require("@electric-sql/pglite");
// Unfortunately, we need to dynamically import the Postgres extensions.
// They are only available as ESM, and if we import them normally,
// our tsconfig will convert them to requires, which will cause errors
// during module resolution.
const { dynamicImport } = require(true && "../../dynamicImport");
const net = require("node:net");
const node_stream_1 = require("node:stream");
const fs = require("fs");
const path = require("node:path");
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
                onMessage(data, { isAuthenticated }) {
                    return __asyncGenerator(this, arguments, function* onMessage_1() {
                        var _a, e_1, _b, _c;
                        // Only forward messages to PGlite after authentication
                        if (!isAuthenticated) {
                            return yield __await(void 0);
                        }
                        const db = yield __await(getDb());
                        if (data[0] === pg_gateway_1.FrontendMessageCode.Terminate) {
                            // When the frontend terminates a connection, throw out all prepared statements
                            // because the next client won't know about them (and may create overlapping statements)
                            yield __await(db.query("DEALLOCATE ALL"));
                        }
                        const response = yield __await(db.execProtocolRaw(data));
                        try {
                            for (var _d = true, _e = __asyncValues(extendedQueryPatch.filterResponse(data, response)), _f; _f = yield __await(_e.next()), _a = _f.done, !_a;) {
                                _c = _f.value;
                                _d = false;
                                try {
                                    const message = _c;
                                    yield yield __await(message);
                                }
                                finally {
                                    _d = true;
                                }
                            }
                        }
                        catch (e_1_1) { e_1 = { error: e_1_1 }; }
                        finally {
                            try {
                                if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                            }
                            finally { if (e_1) throw e_1.error; }
                        }
                        // Extended query patch removes the extra Ready for Query messages that
                        // pglite wrongly sends.
                    });
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
        const oldDb = new PGlite02(Object.assign(Object.assign({}, pgliteArgs), { dataDir }));
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
        const newDb = new pglite_1.PGlite(Object.assign(Object.assign({}, pgliteArgs), { dataDir: pg17Dir }));
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
            const db = new pglite_1.PGlite(Object.assign(Object.assign({}, baseArgs), { dataDir: pg17Dir }));
            await db.waitReady;
            return db;
        }
        catch (err) {
            if (pg17Dir && (0, error_1.hasMessage)(err) && /Database already exists/.test(err.message)) {
                // Clear out the current pglite data
                fs.rmSync(pg17Dir, { force: true, recursive: true });
                const db = new pglite_1.PGlite(Object.assign(Object.assign({}, baseArgs), { dataDir: pg17Dir }));
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
        ? Object.assign({}, options) : undefined;
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
    filterResponse(message, response) {
        return __asyncGenerator(this, arguments, function* filterResponse_1() {
            var _a, e_2, _b, _c;
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
            try {
                // A PGlite response can contain multiple messages
                for (var _d = true, _e = __asyncValues((0, pg_gateway_1.getMessages)(response)), _f; _f = yield __await(_e.next()), _a = _f.done, !_a;) {
                    _c = _f.value;
                    _d = false;
                    try {
                        const bm = _c;
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
                        yield yield __await(bm);
                    }
                    finally {
                        _d = true;
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                }
                finally { if (e_2) throw e_2.error; }
            }
        });
    }
}
exports.PGliteExtendedQueryPatch = PGliteExtendedQueryPatch;
