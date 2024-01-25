"use strict";

const fs = require("fs");
const Twitter = require("twitter");

function printUsage() {
  console.error(
    `
Usage: tweet.js <version>

Credentials must be stored in "twitter.json" in this directory.

Arguments:
  - version: Version of module that was released. e.g. "1.2.3"
`,
  );
  process.exit(1);
}

function getUrl(version) {
  return `https://github.com/firebase/firebase-tools/releases/tag/v${version}`;
}

if (process.argv.length !== 3) {
  console.error("Missing arguments.");
  printUsage();
}

const version = process.argv.pop();
if (!version.match(/^\d+\.\d+\.\d+$/)) {
  console.error(`Version "${version}" not a version number.`);
  printUsage();
}

if (!fs.existsSync(`${__dirname}/twitter.json`)) {
  console.error("Missing credentials.");
  printUsage();
}
const creds = require("./twitter.json");

const client = new Twitter(creds);

client.post(
  "statuses/update",
  { status: `v${version} of @Firebase CLI is available. Release notes: ${getUrl(version)}` },
  (err) => {
    if (err) {
      console.error(`Failed to make a tweet for firebase-tools@${version}: ${err}`);
    }
  },
);
