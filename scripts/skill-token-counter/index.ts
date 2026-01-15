import * as genai from "@google/genai";
import matter from "gray-matter";
import { glob } from "glob";
import * as fs from "fs";
import * as path from "path";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!apiKey) {
  console.error("Error: GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required.");
  process.exit(1);
}

const client = new genai.GoogleGenAI({ apiKey });

const modelId = "gemini-3-pro-preview";

async function countTokens(text: string): Promise<number> {
  if (!text) return 0;
  try {
    const response = await client.models.countTokens({
      model: modelId,
      contents: [{ parts: [{ text }] }],
    });
    return response.totalTokens || 0;
  } catch (error) {
    console.warn("Failed to count tokens:", error);
    return 0;
  }
}

async function main() {
  const skillDir = process.argv[2];
  if (!skillDir) {
    console.error("Usage: npm run count <path-to-skill-dir>");
    process.exit(1);
  }

  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    console.error(`Error: SKILL.md not found in ${skillDir}`);
    process.exit(1);
  }

  console.log(`Analyzing skill at: ${skillDir}\n`);
  // Analyze SKILL.md
  const skillContent = fs.readFileSync(skillMdPath, "utf-8");
  const parsed = matter(skillContent);
  const frontmatterString = JSON.stringify(parsed.data, null, 2);
  const bodyString = parsed.content;

  const [frontmatterTokens, bodyTokens] = await Promise.all([
    countTokens(frontmatterString),
    countTokens(bodyString),
  ]);

  console.log(`SKILL.md Frontmatter: ${frontmatterTokens} tokens`);
  console.log(`SKILL.md Body:        ${bodyTokens} tokens`);

  let totalTokens = frontmatterTokens + bodyTokens;

  // Analyze references
  const referencesPattern = path.join(skillDir, "references", "*.md");
  const referenceFiles = await glob(referencesPattern);

  if (referenceFiles.length > 0) {
    console.log("\nReferences:");

    const results = await Promise.all(
      referenceFiles.map(async (refFile) => {
        const content = fs.readFileSync(refFile, "utf-8");
        const tokens = await countTokens(content);
        return {
          filename: path.basename(refFile),
          tokens,
        };
      }),
    );

    for (const result of results) {
      totalTokens += result.tokens;
      console.log(`  ${result.filename.padEnd(25)} ${result.tokens} tokens`);
    }
  } else {
    console.log("\nNo references found in references/");
  }

  console.log(`\nTotal Tokens: ${totalTokens}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
