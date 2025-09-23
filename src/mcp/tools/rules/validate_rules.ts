import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { testRuleset } from "../../../gcp/rules";
import { resolve } from "path";

// Define interfaces for clarity, based on typical lint/validation issue structures.
// These could potentially be imported if they are exported from gcp/rules.js or a shared types file.
interface SourcePosition {
  fileName?: string;
  line?: number; // 1-based
  column?: number; // 1-based
  currentOffset?: number; // 0-based, inclusive start of error token
  endOffset?: number; // 0-based, exclusive end of error token
}

interface Issue {
  sourcePosition: SourcePosition;
  description: string;
  severity: string; // e.g., "ERROR"
}

/**
 * Formats validation issues into a human-readable string with code snippets and carets.
 * @param issues Array of issues from the ruleset validation.
 * @param rulesSource The original source content of the rules file.
 * @returns A string with formatted issues.
 */
function formatRulesetIssues(issues: Issue[], rulesSource: string): string {
  const sourceLines = rulesSource.split("\n");
  const formattedOutput: string[] = [];

  for (const issue of issues) {
    const { sourcePosition, description, severity } = issue;

    let issueString = `${severity}: ${description} [Ln ${sourcePosition.line}, Col ${sourcePosition.column}]`;

    if (sourcePosition.line) {
      const lineIndex = sourcePosition.line - 1; // 0-based index
      if (lineIndex >= 0 && lineIndex < sourceLines.length) {
        const errorLine = sourceLines[lineIndex];
        issueString += `\n\`\`\`\n${errorLine}`;

        // Add carets if column, currentOffset, and endOffset are available
        if (
          sourcePosition.column &&
          sourcePosition.currentOffset &&
          sourcePosition.endOffset &&
          sourcePosition.column > 0 && // Column should be positive
          sourcePosition.endOffset > sourcePosition.currentOffset // endOffset should be greater
        ) {
          const startColumnOnLine = sourcePosition.column - 1; // 0-based start column for carets
          const errorTokenLength = sourcePosition.endOffset - sourcePosition.currentOffset;

          // Ensure startColumnOnLine is not negative and errorTokenLength is positive
          // Also, ensure startColumnOnLine is within the line length (or reasonably close for safety)
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
  return formattedOutput.join("\n\n"); // Separate multiple issues with a blank line
}

export function validateRulesTool(productName: string) {
  return tool(
    {
      name: "validate_rules",
      description: `Checks the provided ${productName} Rules source for syntax and validation errors. Provide EITHER the source code to validate OR a path to a source file.`,
      inputSchema: z.object({
        source: z
          .string()
          .optional()
          .describe("the rules source code to check. provide either this OR a path"),
        source_file: z
          .string()
          .optional()
          .describe(
            "a file path, relative to the project root, to a file containing the rules source you want to validate. provide this OR source, not both",
          ),
      }),
      annotations: {
        title: `Validate ${productName} Rules`,
        readOnlyHint: true,
      },
      _meta: {
        requiresProject: true,
        requiresAuth: true,
      },
    },
    async ({ source, source_file }, { projectId, config, host }) => {
      if (source && source_file) {
        return mcpError("Must supply `source` or `source_file`, not both.");
      }

      let rulesSourceContent: string;
      if (source_file) {
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
        // If neither source nor source_file is provided, default to empty string for validation.
        // testRuleset might still return general errors not tied to specific lines.
        rulesSourceContent = "";
      }

      const result = await testRuleset(projectId, [
        // The name "firestore.rules" is a convention for testRuleset,
        // actual fileName from issues will be used in formatting.
        { name: "test.rules", content: rulesSourceContent },
      ]);

      if (result.body?.issues?.length) {
        // Cast to our Issue[] type; structure should be compatible.
        const issues = result.body.issues as unknown as Issue[];
        let out = `Found ${issues.length} issues in rules source:\n\n`;
        out += formatRulesetIssues(issues, rulesSourceContent);
        return toContent(out);
      }

      return toContent("OK: No errors detected.");
    },
  );
}
