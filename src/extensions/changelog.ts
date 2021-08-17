import * as marked from "marked";
import * as clc from "cli-color";
import * as semver from "semver";
import TerminalRenderer = require("marked-terminal");
import Table = require("cli-table");

import { listExtensionVersions, parseRef } from "./extensionsApi";
import { readFile } from "./extensionsHelper";
import { logger } from "../logger";
import { logLabeledWarning } from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/*
 * getReleaseNotesForUpdate fetches all version between toVersion and fromVersion and returns the relase notes
 * for those versions if they exist.
 * @param extensionRef
 * @param fromVersion the version you are updating from
 * @param toVersion the version you are upodating to
 * @returns a Record of version number to releaseNotes for that version
 */
export async function getReleaseNotesForUpdate(
  extensionRef: string,
  fromVersion: string,
  toVersion: string
): Promise<Record<string, string>> {
  const releaseNotes: Record<string, string> = {};
  const filter = `id<="${toVersion}" AND id>"${fromVersion}"`;
  const extensionVersions = await listExtensionVersions(extensionRef, filter);
  for (const extensionVersion of extensionVersions) {
    if (extensionVersion.releaseNotes) {
      const version = parseRef(extensionVersion.ref).version!;
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
  const breaks = breakingChangesInUpdate(versions);
  const table = new Table({ head: ["Version", "What's New"], style: { head: ["yellow"] } });
  for (const [version, note] of Object.entries(releaseNotes)) {
    if (breaks.includes(version)) {
      table.push([clc.yellow(version), marked(note)]);
    } else {
      table.push([version, marked(note)]);
    }
  }

  logger.info(clc.bold("What's new with this update:"));
  if (breaks.length) {
    logLabeledWarning(
      "warning",
      "This is a major version update, which means it may contain breaking changes." +
        " Read the release notes carefully before continuing with this update."
    );
  }
  logger.info(table.toString());
}

/**
 * breakingChangesInUpdate identifies which versions in an update are major changes.
 * Exported for testing.
 */
export function breakingChangesInUpdate(versionsInUpdate: string[]): string[] {
  const breaks: string[] = [];
  const semvers = versionsInUpdate.map((v) => semver.parse(v)!).sort(semver.compare);
  for (let i = 1; i < semvers.length; i++) {
    if (
      semvers[i - 1].major < semvers[i].major ||
      (semvers[i - 1].major == 0 &&
        semvers[i].major == 0 &&
        semvers[i - 1].minor < semvers[i].minor)
    ) {
      breaks.push(semvers[i].raw);
    }
  }
  return breaks;
}

/**
 * getLocalChangelog checks directory for a CHANGELOG.md, and parses it into a map of
 * version to release notes for that version.
 * @param directory The directory to check for
 * @returns 
 */
 export async function getLocalChangelog(directory: string): Promise<Record<string, string>> {
  const rawChangelog = readFile(path.resolve(directory, EXTENSIONS_CHANGELOG));
  return parseChangelog(rawChangelog);
}

// Exported for testing.
export function parseChangelog(rawChangelog: string): Record<string,string> {
  const changelog: Record<string, string> = {};
  let currentVersion = "";
  for (const line of rawChangelog.split("\n")) {
    const matches = line.match(VERSION_LINE_REGEX);
    if (matches) {
      currentVersion = matches[1]; // The first capture group is the SemVer.
    } else {
      // Throw away lines that aren't under a specific version.
      if (currentVersion && !changelog[currentVersion]) {
        changelog[currentVersion] = line
      } else {
        changelog[currentVersion] += `\n${line}`
      }
    }
  }
  return changelog;
}