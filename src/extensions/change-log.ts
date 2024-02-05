import * as clc from "colorette";
import { marked } from "marked";
import * as path from "path";
import * as semver from "semver";
import * as TerminalRenderer from "marked-terminal";
const Table = require("cli-table");

import { listExtensionVersions } from "./extensionsApi";
import { readFile } from "./localHelper";
import { logger } from "../logger";
import * as refs from "./refs";
import { logLabeledWarning } from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const EXTENSIONS_CHANGELOG = "CHANGELOG.md";
// Simplifed version of https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const VERSION_LINE_REGEX =
  /##.+?(\d+\.\d+\.\d+(?:-((\d+|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(\d+|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?).*/;

/*
 * getReleaseNotesForUpdate fetches all version between toVersion and fromVersion and returns the relase notes
 * for those versions if they exist.
 * @param extensionRef
 * @param fromVersion the version you are updating from
 * @param toVersion the version you are upodating to
 * @returns a Record of version number to releaseNotes for that version
 */
export async function getReleaseNotesForUpdate(args: {
  extensionRef: string;
  fromVersion: string;
  toVersion: string;
}): Promise<Record<string, string>> {
  const releaseNotes: Record<string, string> = {};
  const filter = `id<="${args.toVersion}" AND id>"${args.fromVersion}"`;
  const extensionVersions = await listExtensionVersions(args.extensionRef, filter);
  extensionVersions.sort((ev1, ev2) => {
    return -semver.compare(ev1.spec.version, ev2.spec.version);
  });
  for (const extensionVersion of extensionVersions) {
    if (extensionVersion.releaseNotes) {
      const version = refs.parse(extensionVersion.ref).version!;
      releaseNotes[version] = extensionVersion.releaseNotes;
    }
  }
  return releaseNotes;
}

/**
 * displayReleaseNotes prints out a nicely formatted table containing all release notes in an update.
 * If there is a major version change, it also prints a warning and highlights those release notes.
 */
export function displayReleaseNotes(releaseNotes: Record<string, string>, fromVersion: string) {
  const versions = [fromVersion].concat(Object.keys(releaseNotes));
  const breakingVersions = breakingChangesInUpdate(versions);
  const table = new Table({ head: ["Version", "What's New"], style: { head: ["yellow", "bold"] } });
  for (const [version, note] of Object.entries(releaseNotes)) {
    if (breakingVersions.includes(version)) {
      table.push([clc.yellow(clc.bold(version)), marked(note)]);
    } else {
      table.push([version, marked(note)]);
    }
  }

  logger.info(clc.bold("What's new with this update:"));
  if (breakingVersions.length) {
    logLabeledWarning(
      "warning",
      "This is a major version update, which means it may contain breaking changes." +
        " Read the release notes carefully before continuing with this update.",
    );
  }
  logger.info(table.toString());
}

/**
 * breakingChangesInUpdate identifies which versions in an update are major changes.
 * Exported for testing.
 */
export function breakingChangesInUpdate(versionsInUpdate: string[]): string[] {
  const breakingVersions: string[] = [];
  const semvers = versionsInUpdate.map((v) => semver.parse(v)!).sort(semver.compare);
  for (let i = 1; i < semvers.length; i++) {
    const hasMajorBump = semvers[i - 1].major < semvers[i].major;
    const hasMinorBumpInPreview =
      semvers[i - 1].major === 0 &&
      semvers[i].major === 0 &&
      semvers[i - 1].minor < semvers[i].minor;
    if (hasMajorBump || hasMinorBumpInPreview) {
      breakingVersions.push(semvers[i].raw);
    }
  }
  return breakingVersions;
}

/**
 * getLocalChangelog checks directory for a CHANGELOG.md, and parses it into a map of
 * version to release notes for that version.
 * @param directory The directory to check for
 * @returns
 */
export function getLocalChangelog(directory: string): Record<string, string> {
  const rawChangelog = readFile(path.resolve(directory, EXTENSIONS_CHANGELOG));
  return parseChangelog(rawChangelog);
}

// Exported for testing.
export function parseChangelog(rawChangelog: string): Record<string, string> {
  const changelog: Record<string, string> = {};
  let currentVersion = "";
  for (const line of rawChangelog.split("\n")) {
    const matches = line.match(VERSION_LINE_REGEX);
    if (matches) {
      currentVersion = matches[1]; // The first capture group is the SemVer.
    } else if (currentVersion) {
      // Throw away lines that aren't under a specific version.
      if (!changelog[currentVersion]) {
        changelog[currentVersion] = line;
      } else {
        changelog[currentVersion] += `\n${line}`;
      }
    }
  }
  return changelog;
}
