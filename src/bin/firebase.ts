#!/usr/bin/env node

// Check for older versions of Node no longer supported by the CLI.
import * as semver from "semver";
import { isEnabled } from "../experiments";
const pkg = require("../../package.json");
const nodeVersion = process.version;
if (!semver.satisfies(nodeVersion, pkg.engines.node)) {
  console.error(
    `Firebase CLI v${pkg.version} is incompatible with Node.js ${nodeVersion} Please upgrade Node.js to version ${pkg.engines.node}`,
  );
  process.exit(1);
}

// we short-circuit the normal process for MCP
if (isEnabled("mcp") && process.argv[2] === "experimental:mcp") {
  const { mcp } = require("./mcp");
  mcp();
} else {
  const { cli } = require("./cli");
  cli(pkg);
}
