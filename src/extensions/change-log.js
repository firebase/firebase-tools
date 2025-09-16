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
exports.parseChangelog = exports.getLocalChangelog = exports.breakingChangesInUpdate = exports.getReleaseNotesForUpdate = void 0;
const marked_1 = require("marked");
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const marked_terminal_1 = require("marked-terminal");
const extensionsApi_1 = require("./extensionsApi");
const localHelper_1 = require("./localHelper");
const refs = __importStar(require("./refs"));
marked_1.marked.use((0, marked_terminal_1.markedTerminal)());
const EXTENSIONS_CHANGELOG = "CHANGELOG.md";
// Simplifed version of https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const VERSION_LINE_REGEX = /##.+?(\d+\.\d+\.\d+(?:-((\d+|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(\d+|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?).*/;
/*
 * getReleaseNotesForUpdate fetches all version between toVersion and fromVersion and returns the relase notes
 * for those versions if they exist.
 * @param extensionRef
 * @param fromVersion the version you are updating from
 * @param toVersion the version you are upodating to
 * @returns a Record of version number to releaseNotes for that version
 */
async function getReleaseNotesForUpdate(args) {
    const releaseNotes = {};
    const filter = `id<="${args.toVersion}" AND id>"${args.fromVersion}"`;
    const extensionVersions = await (0, extensionsApi_1.listExtensionVersions)(args.extensionRef, filter);
    extensionVersions.sort((ev1, ev2) => {
        return -semver.compare(ev1.spec.version, ev2.spec.version);
    });
    for (const extensionVersion of extensionVersions) {
        if (extensionVersion.releaseNotes) {
            const version = refs.parse(extensionVersion.ref).version;
            releaseNotes[version] = extensionVersion.releaseNotes;
        }
    }
    return releaseNotes;
}
exports.getReleaseNotesForUpdate = getReleaseNotesForUpdate;
/**
 * breakingChangesInUpdate identifies which versions in an update are major changes.
 * Exported for testing.
 */
function breakingChangesInUpdate(versionsInUpdate) {
    const breakingVersions = [];
    const semvers = versionsInUpdate.map((v) => semver.parse(v)).sort(semver.compare);
    for (let i = 1; i < semvers.length; i++) {
        const hasMajorBump = semvers[i - 1].major < semvers[i].major;
        const hasMinorBumpInPreview = semvers[i - 1].major === 0 &&
            semvers[i].major === 0 &&
            semvers[i - 1].minor < semvers[i].minor;
        if (hasMajorBump || hasMinorBumpInPreview) {
            breakingVersions.push(semvers[i].raw);
        }
    }
    return breakingVersions;
}
exports.breakingChangesInUpdate = breakingChangesInUpdate;
/**
 * getLocalChangelog checks directory for a CHANGELOG.md, and parses it into a map of
 * version to release notes for that version.
 * @param directory The directory to check for
 * @returns
 */
function getLocalChangelog(directory) {
    const rawChangelog = (0, localHelper_1.readFile)(path.resolve(directory, EXTENSIONS_CHANGELOG));
    return parseChangelog(rawChangelog);
}
exports.getLocalChangelog = getLocalChangelog;
// Exported for testing.
function parseChangelog(rawChangelog) {
    const changelog = {};
    let currentVersion = "";
    for (const line of rawChangelog.split("\n")) {
        const matches = line.match(VERSION_LINE_REGEX);
        if (matches) {
            currentVersion = matches[1]; // The first capture group is the SemVer.
        }
        else if (currentVersion) {
            // Throw away lines that aren't under a specific version.
            if (!changelog[currentVersion]) {
                changelog[currentVersion] = line;
            }
            else {
                changelog[currentVersion] += `\n${line}`;
            }
        }
    }
    return changelog;
}
exports.parseChangelog = parseChangelog;
//# sourceMappingURL=change-log.js.map