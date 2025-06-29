import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { BaseScorer } from "./base";
import { ScorerContext, ScorerResult } from "../types";
import { SemanticCodeScorer } from "./semanticCode";

interface GoldenFileScorerOptions {
  useSemanticComparison?: boolean; // Use semantic comparison for code files
  semanticThreshold?: number; // Minimum similarity score for semantic comparison
  codeExtensions?: string[]; // File extensions to treat as code
}

/**
 * Scorer that compares output files against expected golden files
 */
export class GoldenFileScorer extends BaseScorer {
  private options: GoldenFileScorerOptions;
  private semanticScorer?: SemanticCodeScorer;

  constructor(options: GoldenFileScorerOptions = {}) {
    super("GoldenFileScorer");
    this.options = {
      useSemanticComparison: true,
      semanticThreshold: 0.85,
      codeExtensions: [".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java", ".dart", ".rs", ".cpp", ".c"],
      ...options,
    };
    
    if (this.options.useSemanticComparison) {
      this.semanticScorer = new SemanticCodeScorer({
        threshold: this.options.semanticThreshold,
        useEmbeddings: true,
        ignoreWhitespace: true,
        ignoreComments: true,
      });
    }
  }

  async score(context: ScorerContext): Promise<ScorerResult> {
    try {
      const { caseConfig, workspaceDir } = context;
      
      // Skip if no expected files
      if (!caseConfig.expectedFiles || Object.keys(caseConfig.expectedFiles).length === 0) {
        return this.createResult(true, { message: "No expected files to compare" });
      }
      
      const mismatches: string[] = [];
      const missing: string[] = [];
      const matches: string[] = [];
      const semanticMatches: Record<string, number> = {};
      
      // Compare each expected file
      for (const [expectedPath, expectedContent] of Object.entries(caseConfig.expectedFiles)) {
        const actualPath = path.join(workspaceDir, expectedPath);
        
        if (!await fs.pathExists(actualPath)) {
          missing.push(expectedPath);
          continue;
        }
        
        const actualContent = await fs.readFile(actualPath, "utf-8");
        
        // Check if this is a code file
        const isCodeFile = this.isCodeFile(expectedPath);
        
        if (isCodeFile && this.options.useSemanticComparison && this.semanticScorer) {
          // Use semantic comparison for code files
          const semanticResult = await this.semanticScorer.score({
            ...context,
            caseConfig: {
              ...caseConfig,
              expectedFiles: { [expectedPath]: expectedContent },
            },
          });
          
          const fileScore = semanticResult.details?.fileScores?.[expectedPath] || 0;
          
          if (semanticResult.passed) {
            matches.push(expectedPath);
            semanticMatches[expectedPath] = fileScore;
            this.logDebug(`File ${expectedPath} matched semantically (${(fileScore * 100).toFixed(2)}%)`);
          } else {
            mismatches.push(expectedPath);
            this.logDebug(`File ${expectedPath} failed semantic match (${(fileScore * 100).toFixed(2)}%)`);
          }
        } else {
          // Use exact comparison for non-code files or when semantic comparison is disabled
          if (this.normalizeContent(actualContent) === this.normalizeContent(expectedContent)) {
            matches.push(expectedPath);
          } else {
            mismatches.push(expectedPath);
            
            // Log diff for debugging
            this.logDebug(`File mismatch: ${expectedPath}`);
            this.logDebug(`Expected hash: ${this.hashContent(expectedContent)}`);
            this.logDebug(`Actual hash: ${this.hashContent(actualContent)}`);
          }
        }
      }
      
      // Check for extra files (files that exist but weren't expected)
      const actualFiles = await this.listFiles(workspaceDir);
      const expectedPaths = new Set(Object.keys(caseConfig.expectedFiles));
      const extraFiles = actualFiles.filter(f => !expectedPaths.has(f));
      
      // Determine if passed
      const passed = missing.length === 0 && mismatches.length === 0;
      
      return this.createResult(passed, {
        matches: matches.length,
        mismatches: mismatches.length,
        missing: missing.length,
        extra: extraFiles.length,
        semanticMatches: Object.keys(semanticMatches).length,
        details: {
          matchedFiles: matches,
          mismatchedFiles: mismatches,
          missingFiles: missing,
          extraFiles: extraFiles.slice(0, 10), // Limit to prevent huge output
          semanticScores: semanticMatches,
        },
      });
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Check if a file should be treated as code
   */
  private isCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.options.codeExtensions!.includes(ext);
  }

  /**
   * Normalize content for comparison (handle line endings, trailing whitespace)
   */
  private normalizeContent(content: string): string {
    return content
      .replace(/\r\n/g, "\n") // Normalize line endings
      .replace(/\s+$/gm, "") // Remove trailing whitespace
      .trim(); // Remove leading/trailing whitespace
  }

  /**
   * Hash content for logging
   */
  private hashContent(content: string): string {
    return crypto
      .createHash("sha256")
      .update(this.normalizeContent(content))
      .digest("hex")
      .substring(0, 8);
  }

  /**
   * List all files in directory recursively
   */
  private async listFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    async function walk(currentDir: string, baseDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden and common ignored directories
          if (!entry.name.startsWith(".") && 
              !["node_modules", "__pycache__", "target", "dist", "build"].includes(entry.name)) {
            await walk(fullPath, baseDir);
          }
        } else if (entry.isFile() && !entry.name.startsWith(".")) {
          const relativePath = path.relative(baseDir, fullPath);
          files.push(relativePath);
        }
      }
    }
    
    await walk(dir, dir);
    return files;
  }
}