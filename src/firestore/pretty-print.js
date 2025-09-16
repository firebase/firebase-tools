"use strict";
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
exports.PrettyPrint = void 0;
const clc = __importStar(require("colorette"));
const Table = __importStar(require("cli-table3"));
const sort = __importStar(require("./api-sort"));
const types = __importStar(require("./api-types"));
const logger_1 = require("../logger");
const util = __importStar(require("./util"));
const utils_1 = require("../utils");
class PrettyPrint {
    /**
     * Print an array of indexes to the console.
     * @param indexes the array of indexes.
     */
    prettyPrintIndexes(indexes) {
        if (indexes.length === 0) {
            logger_1.logger.info("None");
            return;
        }
        const sortedIndexes = indexes.sort(sort.compareApiIndex);
        sortedIndexes.forEach((index) => {
            logger_1.logger.info(this.prettyIndexString(index));
        });
    }
    /**
     * Print an array of databases to the console as an ASCII table.
     * @param databases the array of Firestore databases.
     */
    prettyPrintDatabases(databases) {
        if (databases.length === 0) {
            logger_1.logger.info("No databases found.");
            return;
        }
        const sortedDatabases = databases.sort(sort.compareApiDatabase);
        const table = new Table({
            head: ["Database Name"],
            colWidths: [Math.max(...sortedDatabases.map((database) => database.name.length + 5), 20)],
        });
        table.push(...sortedDatabases.map((database) => [this.prettyDatabaseString(database)]));
        logger_1.logger.info(table.toString());
    }
    /**
     * Print important fields of a database to the console as an ASCII table.
     * @param database the Firestore database.
     */
    prettyPrintDatabase(database) {
        let colValueWidth = Math.max(50, 5 + database.name.length);
        if (database.cmekConfig) {
            colValueWidth = Math.max(140, 20 + database.cmekConfig.kmsKeyName.length);
        }
        const table = new Table({
            head: ["Field", "Value"],
            colWidths: [30, colValueWidth],
        });
        const edition = !database.databaseEdition ||
            database.databaseEdition === types.DatabaseEdition.DATABASE_EDITION_UNSPECIFIED
            ? types.DatabaseEdition.STANDARD
            : database.databaseEdition;
        table.push(["Name", clc.yellow(database.name)], ["Create Time", clc.yellow(database.createTime)], ["Last Update Time", clc.yellow(database.updateTime)], ["Type", clc.yellow(database.type)], ["Edition", clc.yellow(edition)], ["Location", clc.yellow(database.locationId)], ["Delete Protection State", clc.yellow(database.deleteProtectionState)], ["Point In Time Recovery", clc.yellow(database.pointInTimeRecoveryEnablement)], ["Earliest Version Time", clc.yellow(database.earliestVersionTime)], ["Version Retention Period", clc.yellow(database.versionRetentionPeriod)]);
        if (database.cmekConfig) {
            table.push(["KMS Key Name", clc.yellow(database.cmekConfig.kmsKeyName)]);
            if (database.cmekConfig.activeKeyVersion) {
                table.push([
                    "Active Key Versions",
                    clc.yellow(this.prettyStringArray(database.cmekConfig.activeKeyVersion)),
                ]);
            }
        }
        logger_1.logger.info(table.toString());
    }
    /**
     * Returns a pretty representation of a String array.
     * @param stringArray the string array to be formatted.
     */
    prettyStringArray(stringArray) {
        let result = "";
        stringArray.forEach((str) => {
            result += `${str}\n`;
        });
        return result;
    }
    /**
     * Print an array of backups to the console as an ASCII table.
     * @param backups the array of Firestore backups.
     */
    prettyPrintBackups(backups) {
        if (backups.length === 0) {
            logger_1.logger.info("No backups found.");
            return;
        }
        const sortedBackups = backups.sort(sort.compareApiBackup);
        const table = new Table({
            head: ["Backup Name", "Database Name", "Snapshot Time", "State"],
            colWidths: [
                Math.max(...sortedBackups.map((backup) => backup.name.length + 5), 20),
                Math.max(...sortedBackups.map((backup) => backup.database.length + 5), 20),
                30,
                10,
            ],
        });
        table.push(...sortedBackups.map((backup) => [
            this.prettyBackupString(backup),
            this.prettyDatabaseString(backup.database || ""),
            backup.snapshotTime,
            backup.state,
        ]));
        logger_1.logger.info(table.toString());
    }
    /**
     * Print an array of backup schedules to the console as an ASCII table.
     * @param backupSchedules the array of Firestore backup schedules.
     * @param databaseId the database these schedules are associated with.
     */
    prettyPrintBackupSchedules(backupSchedules, databaseId) {
        if (backupSchedules.length === 0) {
            logger_1.logger.info(`No backup schedules for database ${databaseId} found.`);
            return;
        }
        const sortedBackupSchedules = backupSchedules.sort(sort.compareApiBackupSchedule);
        sortedBackupSchedules.forEach((schedule) => this.prettyPrintBackupSchedule(schedule));
    }
    /**
     * Print important fields of a backup schedule to the console as an ASCII table.
     * @param backupSchedule the Firestore backup schedule.
     */
    prettyPrintBackupSchedule(backupSchedule) {
        const table = new Table({
            head: ["Field", "Value"],
            colWidths: [25, Math.max(50, 5 + backupSchedule.name.length)],
        });
        table.push(["Name", clc.yellow(backupSchedule.name)], ["Create Time", clc.yellow(backupSchedule.createTime)], ["Last Update Time", clc.yellow(backupSchedule.updateTime)], ["Retention", clc.yellow(backupSchedule.retention)], ["Recurrence", this.prettyRecurrenceString(backupSchedule)]);
        logger_1.logger.info(table.toString());
    }
    /**
     * Returns a pretty representation of the Recurrence of the given backup schedule.
     * @param {BackupSchedule} backupSchedule the backup schedule.
     */
    prettyRecurrenceString(backupSchedule) {
        if (backupSchedule.dailyRecurrence) {
            return clc.yellow("DAILY");
        }
        else if (backupSchedule.weeklyRecurrence) {
            return clc.yellow(`WEEKLY (${backupSchedule.weeklyRecurrence.day})`);
        }
        return "";
    }
    /**
     * Print important fields of a backup to the console as an ASCII table.
     * @param backup the Firestore backup.
     */
    prettyPrintBackup(backup) {
        const table = new Table({
            head: ["Field", "Value"],
            colWidths: [25, Math.max(50, 5 + backup.name.length, 5 + backup.database.length)],
        });
        table.push(["Name", clc.yellow(backup.name)], ["Database", clc.yellow(backup.database)], ["Database UID", clc.yellow(backup.databaseUid)], ["State", clc.yellow(backup.state)], ["Snapshot Time", clc.yellow(backup.snapshotTime)], ["Expire Time", clc.yellow(backup.expireTime)], ["Stats", clc.yellow(backup.stats)]);
        logger_1.logger.info(table.toString());
    }
    /**
     * Print a Firestore operation as an ASCII table.
     */
    prettyPrintOperation(operation) {
        const table = new Table({
            head: ["Operation", ""],
        });
        table.push(["Name", clc.yellow(operation.name)], ["Done?", clc.yellow(operation.done ? "YES" : "NO")], ["Metadata", clc.yellow(JSON.stringify(operation.metadata, undefined, 2))]);
        if (operation.response) {
            table.push(["Response", clc.yellow(JSON.stringify(operation.response, undefined, 2))]);
        }
        logger_1.logger.info(table.toString());
    }
    /**
     * Print Firestore operations as an ASCII table.
     */
    prettyPrintOperations(operations) {
        if (operations.length === 0) {
            logger_1.logger.info("No operations found.");
            return;
        }
        const table = new Table({
            head: ["Operation Name", "Done"],
        });
        for (const op of operations) {
            table.push([clc.yellow(op.name), op.done ? clc.green("YES") : clc.yellow("NO")]);
        }
        logger_1.logger.info(table.toString());
    }
    /**
     * Print an array of locations to the console in an ASCII table. Group multi regions together
     *  Example: United States: nam5
     * @param locations the array of locations.
     */
    prettyPrintLocations(locations) {
        if (locations.length === 0) {
            logger_1.logger.info("No Locations Available");
            return;
        }
        const table = new Table({
            head: ["Display Name", "LocationId"],
            colWidths: [20, 30],
        });
        table.push(...locations
            .sort(sort.compareLocation)
            .map((location) => [location.displayName, location.locationId]));
        logger_1.logger.info(table.toString());
    }
    /**
     * Print an array of field overrides to the console.
     * @param fields  the array of field overrides.
     */
    printFieldOverrides(fields) {
        if (fields.length === 0) {
            logger_1.logger.info("None");
            return;
        }
        const sortedFields = fields.sort(sort.compareApiField);
        sortedFields.forEach((field) => {
            logger_1.logger.info(this.prettyFieldString(field));
        });
    }
    /**
     * Get a colored, pretty-printed representation of an index.
     */
    prettyIndexString(index, includeState = true) {
        let result = "";
        if (index.state && includeState) {
            const stateMsg = `[${index.state}] `;
            if (index.state === types.State.READY) {
                result += clc.green(stateMsg);
            }
            else if (index.state === types.State.CREATING) {
                result += clc.yellow(stateMsg);
            }
            else {
                result += clc.red(stateMsg);
            }
        }
        const nameInfo = util.parseIndexName(index.name);
        result += clc.cyan(`(${nameInfo.collectionGroupId})`);
        result += " -- ";
        index.fields.forEach((field) => {
            if (field.fieldPath === "__name__") {
                return;
            }
            // Normal field indexes have an "order", array indexes have an
            // "arrayConfig", and vector indexes have a "vectorConfig" we want to
            // display whichever one is present.
            let configString;
            if (field.order) {
                configString = field.order;
            }
            else if (field.arrayConfig) {
                configString = field.arrayConfig;
            }
            else if (field.vectorConfig) {
                configString = `VECTOR<${field.vectorConfig.dimension}>`;
            }
            result += `(${field.fieldPath},${configString}) `;
        });
        result += " -- ";
        if (index.density !== undefined) {
            result += clc.cyan(`Density:${index.density} `);
        }
        if (index.multikey !== undefined) {
            result += clc.cyan(`Multikey:${index.multikey ? "YES" : "NO"}`);
        }
        return result;
    }
    /**
     * Get a colored, pretty-printed representation of a backup
     */
    prettyBackupString(backup) {
        return clc.yellow(backup.name || "");
    }
    /**
     * Get a colored, pretty-printed representation of a backup schedule
     */
    prettyBackupScheduleString(backupSchedule) {
        return clc.yellow(backupSchedule.name || "");
    }
    /**
     * Get a colored, pretty-printed representation of a database
     */
    prettyDatabaseString(database) {
        return clc.yellow(typeof database === "string" ? database : database.name);
    }
    /**
     * Get a URL to view a given Firestore database in the Firebase console
     */
    firebaseConsoleDatabaseUrl(project, databaseId) {
        const urlFriendlyDatabaseId = databaseId === "(default)" ? "-default-" : databaseId;
        return (0, utils_1.consoleUrl)(project, `/firestore/databases/${urlFriendlyDatabaseId}/data`);
    }
    /**
     * Get a colored, pretty-printed representation of a field
     */
    prettyFieldString(field) {
        let result = "";
        const parsedName = util.parseFieldName(field.name);
        result +=
            "[" +
                clc.cyan(parsedName.collectionGroupId) +
                "." +
                clc.yellow(parsedName.fieldPath) +
                "] --";
        const fieldIndexes = field.indexConfig.indexes || [];
        if (fieldIndexes.length > 0) {
            fieldIndexes.forEach((index) => {
                const firstField = index.fields[0];
                const mode = firstField.order || firstField.arrayConfig;
                result += ` (${mode})`;
            });
        }
        else {
            result += " (no indexes)";
        }
        const fieldTtl = field.ttlConfig;
        if (fieldTtl) {
            result += ` TTL(${fieldTtl.state})`;
        }
        return result;
    }
}
exports.PrettyPrint = PrettyPrint;
//# sourceMappingURL=pretty-print.js.map