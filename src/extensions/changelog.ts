import * as marked from "marked";
import * as clc from "cli-color";
import * as semver from "semver";
import TerminalRenderer = require("marked-terminal");
import Table = require("cli-table");

import { listExtensionVersions, parseRef } from "./extensionsApi";
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

export function breakingChangesInUpdate(versionsInUpdate: string[]): string[] {
  const breaks: string[] = [];
  const semvers = versionsInUpdate.map((v) => semver.parse(v)!).sort(semver.compare);
  for (let i = 1; i < versionsInUpdate.length; i++) {
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
