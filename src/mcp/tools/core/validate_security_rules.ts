import { z } from "zod";
import { tool } from "../../tool";
import { checkFeatureActive, mcpError, toContent } from "../../util";
import { testRuleset } from "../../../gcp/rules";
import { resolve } from "path";
import { Client } from "../../../apiv2";
import { updateRulesWithClient } from "../../../rtdb";
import { getErrMsg } from "../../../error";
import { getDefaultDatabaseInstance } from "../../../getDefaultDatabaseInstance";
import { McpContext } from "../../types";

interface SourcePosition {
  fileName?: string;
  line?: number;
  column?: number;
  currentOffset?: number;
  endOffset?: number;
}

interface Issue {
  sourcePosition: SourcePosition;
  description: string;
  severity: string;
}

function formatRulesetIssues(issues: Issue[], rulesSource: string): string {
  const sourceLines = rulesSource.split("\n");
  const formattedOutput: string[] = [];

  for (const issue of issues) {
    const { sourcePosition, description, severity } = issue;

    let issueString = `${severity}: ${description} [Ln ${sourcePosition.line}, Col ${sourcePosition.column}]`;

    if (sourcePosition.line) {
      const lineIndex = sourcePosition.line - 1;
      if (lineIndex >= 0 && lineIndex < sourceLines.length) {
        const errorLine = sourceLines[lineIndex];
        issueString += `\n\`\`\`\n${errorLine}`;

        if (
          sourcePosition.column &&
          sourcePosition.currentOffset &&
          sourcePosition.endOffset &&
          sourcePosition.column > 0 &&
          sourcePosition.endOffset > sourcePosition.currentOffset
        ) {
          const startColumnOnLine = sourcePosition.column - 1;
          const errorTokenLength = sourcePosition.endOffset - sourcePosition.currentOffset;

          if (
            startColumnOnLine >= 0 &&
            errorTokenLength > 0 &&
            startColumnOnLine <= errorLine.length
          ) {
            const padding = " ".repeat(startColumnOnLine);
            const carets = "^".repeat(errorTokenLength);
            issueString += `\n${padding}${carets}\n\`\`\``;
          }
        }
      }
    }
    formattedOutput.push(issueString);
  }
  return formattedOutput.join("\n\n");
}

export const validate_security_rules = tool(
  "core",
  {
    name: "validate_security_rules",
    description:
      "Use this to check Firebase Security Rules for Firestore, Storage, or Realtime Database for syntax and validation errors.",
    inputSchema: z.object({
      type: z.enum(["firestore", "storage", "rtdb"]),
      source: z
        .string()
        .optional()
        .describe("The rules source code to check. Provide either this or a path."),
      source_file: z
        .string()
        .optional()
        .describe(
          "A file path, relative to the project root, to a file containing the rules source you want to validate. Provide this or source, not both.",
        ),
    }),
    annotations: {
      title: "Validate Firebase Security Rules",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
    isAvailable: async (ctx: McpContext): Promise<boolean> => {
      const rtdbActive = await checkFeatureActive("database", ctx.projectId, {
        config: ctx.config,
      });
      const storageActive = await checkFeatureActive("storage", ctx.projectId, {
        config: ctx.config,
      });
      const firestoreActive = await checkFeatureActive("firestore", ctx.projectId, {
        config: ctx.config,
      });
      return rtdbActive || storageActive || firestoreActive;
    },
  },
  async ({ type, source, source_file }, { projectId, config, host }) => {
    let rulesSourceContent: string;
    if (source && source_file) {
      return mcpError("Must supply `source` or `source_file`, not both.");
    } else if (source_file) {
      try {
        const filePath = resolve(source_file, host.cachedProjectDir!);
        if (filePath.includes("../"))
          return mcpError("Cannot read files outside of the project directory.");
        rulesSourceContent = config.readProjectFile(source_file);
      } catch (e: any) {
        return mcpError(`Failed to read source_file '${source_file}': ${e.message}`);
      }
    } else if (source) {
      rulesSourceContent = source;
    } else {
      return mcpError("Must supply at least one of `source` or `source_file`.");
    }

    if (type === "rtdb") {
      const dbUrl = await getDefaultDatabaseInstance(projectId);
      const client = new Client({ urlPrefix: dbUrl });
      try {
        await updateRulesWithClient(client, source, { dryRun: true });
      } catch (e: unknown) {
        host.logger.debug(`failed to validate rules at url ${dbUrl}`);
        // TODO: This really should only return an MCP error if we couldn't validate
        // If the rules are invalid, we should return that as content
        return mcpError(getErrMsg(e));
      }
      return toContent("The inputted rules are valid!");
    }

    // Firestore and Storage
    const result = await testRuleset(projectId, [
      { name: "test.rules", content: rulesSourceContent },
    ]);

    if (result.body?.issues?.length) {
      const issues = result.body.issues as unknown as Issue[];
      let out = `Found ${issues.length} issues in rules source:\n\n`;
      out += formatRulesetIssues(issues, rulesSourceContent);
      return toContent(out);
    }

    return toContent("OK: No errors detected.");
  },
);
