# Firebase MCP Server Contributing Guide

## Overview

The Firebase MCP server offers tools that LLMs can use when interacting with Firebase.
The tools let you fetch important context about what is deployed to your project,
access agents that can perform specialized tasks, or make minor modifications to your project.

## Audience

If you are a developer interested in contributing to the MCP server, this is the
documentation for you! This guide describes how to be successful in contributing
to our repository.

## Getting Started

The Firebase MCP server lives alongside the Firebase CLI in the [firebase/firebase-tools][gh-repo] repo.
It lives here so that it can share code for authentication, API calls, and utilities with the CLI.

External developers: If you're interested in contributing code, get started by
[making a fork of the repository for your GitHub account](https://help.github.com/en/github/getting-started-with-github/fork-a-repo).

Internal developers: Go to go/firebase-github-request and ask for access to this repo. You should work
off of sepearate branches in this repo, to ensure that all CI runs correctly for you.

### Contribution Process

External developers: The preferred means of contribution to the MCP server is by creating a branch in your
own fork, pushing your changes there, and submitting a Pull Request to the
`main` branch of `firebase/firebase-tools`.

Internal developers: Instead of working off of a fork, please make a branch on [firebase/firebase-tools][gh-repo]
named <yourInitialsOrLDAP>-<feature> (for example, `jh-dataconnect-tools`)

If your change is visible to users, it should be in the
[changelog](https://github.com/firebase/firebase-tools/releases). Please
add an entry to the `CHANGELOG.md` file. This log is emptied after every release
and is used to generate the release notes posted in the
[Releases](https://github.com/firebase/firebase-tools/releases) page. Markdown
formatting is respected (using the GitHub style).

NOTE: Any new files added to the repository **must** be written in TypeScript
and **must** include unit tests. There are very few exceptions to this rule.

After your Pull Request passes the tests and is approved by a Firebase CLI team
member, they will merge your PR. Thank you for your contribution!

### Setting up your development environment

Please follow the instructions in the [CLI's CONTRIBUTING.md](https://github.com/firebase/firebase-tools/blob/main/CONTRIBUTING.md#setting-up-your-development-environment) to get your development environment set up.

There are a few extra things to set up when developing the MCP server.

### Testing with the MCP Inspector

During early development, you will want to test that your tools outputs what you expect, without burning tokens.
The easiest way to do this is the [MCP inspector](https://github.com/modelcontextprotocol/inspector). From a
Firebase project directory, run:

```
npx -y @modelcontextprotocol/inspector
```

This will print out a localhost link to a simple testing UI. There, you can configure the MCP server
and manually list and execute tools.

```
Transport Type: STDIO
Command: firebase
Arguments: mcp

```

## Building MCP tools

IMPORTANT: LLMs cannot handle large number of tools. Please consider whether the functionality
you want to add can be added to an existing tool.

### Setting up a new tool

#### Create a file for your tool

First, create a new file in `src/mcp/tools/<product>`.
If your product does not have tools yet, create a new directory under `src/mcp/tools`/.
If the tool is relevant for many Firebase products, put it under `core`.

Tool files should be named `<product>/<foo_tool>`. The tool will then be listed as `<product>_<foo_tool>`.

```typescript
import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";

export const foo_bar = tool(
  {
    name: "foo_bar",
    description: "Foos a bar. This description informs LLMs when to use this tool",
    inputSchema: z.object({
      foo: z
        .string()
        .describe("The foo to bar. Parameter descriptions inform LLMs how to use this param."),
    }),
    annotations: {
      title: "Foo Bar",
      readOnlyHint: true, // True if this tool makes no changes to your local files or Firebase project.
      idempotentHint: false, // True if this tool can safely be run multiple times without redundant effects.
      destructiveHint: false, // True if this tool deletes files or data.
      openWorldHint: false, // Does this tool interact with open (ie the web) or closed systems (ie a Firestore DB)
    },
    _meta: {
      requiresProject: true, // Does this tool require you to be in a Firebase project directory?
      requiresAuth: true, // Does this tool require you to be authenticated (usually via `firebase login`)
      requiresGemini: true, // Does this tool use Gemini in Firebase in any way?
    },
  },
  async (
    { foo }, // Anything passed in inputSchema is avialable here.
    { projectId, accountEmail, config }, // See ServerToolContext for a complete list of available fields
  ) => {
    // Business logic for the tool
    let foo;
    try {
      const foo = await barFood(prompt, projectId);
    } catch (e: any) {
      // return mcpError to handle error cases
      return mcpError("Foo could not be barred");
    }
    // Use toContent to return successes in a MCP friendly format.
    return toContent(schema);
  },
);
```

Here are a few style notes:

- Tool names
  - should not include product name
  - should be all lower-case letters
  - should be snake case
- Descriptions
  - should be aimed at informing LLMs, not humans

#### Load the command

Next, go to `src/mcp/tools/<product>/index.ts`, and add your tool:

```typescript
import { foo_bar } from "./foo_bar"

export const <product>Tools = [
  foo_bar,
];

```

If this is the first tool for this product, also go to `src/mcp/tools/index.ts` and add your product:

```typescript
import { <product>Tools } from "./<product>/index"

const tools: Record<ServerFeature, ServerTool[]> = {
  // Exisitng tools here...
  <product>: addFeaturePrefix("<product>", <product>Tools),
}

```

### Update the README.md tool list

Run the following command to add your new tool to the list in `src/mcp/README.md`

```
node lib/bin/firebase.js mcp --generate-tool-list
```

### Logging and terminal formatting

The Firebase CLI has a central logger available in `src/logger`. You should
never use `console.log()` in an MCP tool - STDOUT must only take structured MCP output.

Any logs for your tool will be written to `firebase-debug.log`

[gh-repo]: https://github.com/firebase/firebase-tools
