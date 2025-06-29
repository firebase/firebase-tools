import * as fs from "fs-extra";
import * as path from "path";
import { BaseScorer } from "./base";
import { ScorerContext, ScorerResult } from "../types";
import { stringSimilarity } from "string-similarity-js";

interface CodeSimilarityOptions {
  threshold?: number; // Minimum similarity score to pass (0-1)
  useEmbeddings?: boolean; // Use ML embeddings vs string similarity
  ignoreWhitespace?: boolean; // Normalize whitespace before comparison
  ignoreComments?: boolean; // Strip comments before comparison
}

/**
 * Scorer that compares code files using semantic similarity
 * rather than exact character matching
 */
export class SemanticCodeScorer extends BaseScorer {
  private options: CodeSimilarityOptions;
  private embeddingModel: any = null;
  private modelInitialized = false;

  constructor(options: CodeSimilarityOptions = {}) {
    super("SemanticCodeScorer");
    this.options = {
      threshold: 0.85, // Default to 85% similarity
      useEmbeddings: true,
      ignoreWhitespace: true,
      ignoreComments: true,
      ...options,
    };
  }

  async score(context: ScorerContext): Promise<ScorerResult> {
    try {
      const { caseConfig, workspaceDir } = context;
      
      // Skip if no expected files
      if (!caseConfig.expectedFiles || Object.keys(caseConfig.expectedFiles).length === 0) {
        return this.createResult(true, { message: "No expected files to compare" });
      }
      
      // Initialize embedding model if needed
      if (this.options.useEmbeddings && !this.modelInitialized) {
        await this.initializeEmbeddingModel();
      }
      
      const fileScores: Record<string, number> = {};
      const missingFiles: string[] = [];
      let totalScore = 0;
      let fileCount = 0;
      
      // Compare each expected file
      for (const [expectedPath, expectedContent] of Object.entries(caseConfig.expectedFiles)) {
        const actualPath = path.join(workspaceDir, expectedPath);
        
        if (!await fs.pathExists(actualPath)) {
          missingFiles.push(expectedPath);
          continue;
        }
        
        const actualContent = await fs.readFile(actualPath, "utf-8");
        
        // Calculate similarity score
        const score = await this.calculateSimilarity(
          expectedContent,
          actualContent,
          expectedPath
        );
        
        fileScores[expectedPath] = score;
        totalScore += score;
        fileCount++;
        
        this.logDebug(`File ${expectedPath} similarity: ${(score * 100).toFixed(2)}%`);
      }
      
      // Calculate average score
      const averageScore = fileCount > 0 ? totalScore / fileCount : 0;
      const passed = averageScore >= this.options.threshold! && missingFiles.length === 0;
      
      return this.createResult(passed, {
        averageScore: averageScore,
        threshold: this.options.threshold,
        fileScores,
        missingFiles,
        scoreType: this.options.useEmbeddings ? "semantic-embedding" : "string-similarity",
        details: {
          totalFiles: Object.keys(caseConfig.expectedFiles).length,
          scoredFiles: fileCount,
          missingCount: missingFiles.length,
          passedFiles: Object.entries(fileScores).filter(([_, score]) => score >= this.options.threshold!).length,
        },
      });
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Initialize the embedding model for semantic comparison
   */
  private async initializeEmbeddingModel(): Promise<void> {
    try {
      // Dynamically import transformers.js
      const { pipeline } = await import("@xenova/transformers");
      
      this.logDebug("Initializing code embedding model...");
      
      // Use a smaller, faster model for code similarity
      // Options: 'Xenova/all-MiniLM-L6-v2' (general), 'jinaai/jina-embeddings-v2-base-code' (code-specific)
      this.embeddingModel = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2", // Faster, smaller model
        {
          quantized: true, // Use quantized model for faster inference
        }
      );
      
      this.modelInitialized = true;
      this.logDebug("Embedding model initialized successfully");
      
    } catch (error) {
      this.logDebug(`Failed to initialize embedding model: ${error}. Falling back to string similarity.`);
      this.options.useEmbeddings = false;
    }
  }

  /**
   * Calculate similarity between expected and actual code
   */
  private async calculateSimilarity(
    expected: string,
    actual: string,
    filePath: string
  ): Promise<number> {
    // Preprocess code based on options
    const processedExpected = this.preprocessCode(expected, filePath);
    const processedActual = this.preprocessCode(actual, filePath);
    
    if (this.options.useEmbeddings && this.embeddingModel) {
      return this.calculateEmbeddingSimilarity(processedExpected, processedActual);
    } else {
      return this.calculateStringSimilarity(processedExpected, processedActual);
    }
  }

  /**
   * Calculate similarity using embeddings
   */
  private async calculateEmbeddingSimilarity(code1: string, code2: string): Promise<number> {
    try {
      // Get embeddings for both code snippets
      const [embedding1, embedding2] = await Promise.all([
        this.getEmbedding(code1),
        this.getEmbedding(code2),
      ]);
      
      // Calculate cosine similarity
      return this.cosineSimilarity(embedding1, embedding2);
      
    } catch (error) {
      this.logDebug(`Embedding similarity failed: ${error}. Using string similarity.`);
      return this.calculateStringSimilarity(code1, code2);
    }
  }

  /**
   * Get embedding vector for code
   */
  private async getEmbedding(code: string): Promise<number[]> {
    const output = await this.embeddingModel(code, {
      pooling: "mean",
      normalize: true,
    });
    
    return Array.from(output.data);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error("Vectors must have the same length");
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Calculate string-based similarity
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    // Use bigram-based string similarity
    return stringSimilarity(str1, str2);
  }

  /**
   * Preprocess code based on file type and options
   */
  private preprocessCode(code: string, filePath: string): string {
    let processed = code;
    
    // Normalize whitespace if requested
    if (this.options.ignoreWhitespace) {
      // Normalize line endings
      processed = processed.replace(/\r\n/g, "\n");
      
      // Normalize indentation (convert tabs to spaces)
      processed = processed.replace(/\t/g, "  ");
      
      // Remove trailing whitespace
      processed = processed.replace(/[ \t]+$/gm, "");
      
      // Normalize multiple blank lines to single blank line
      processed = processed.replace(/\n\s*\n\s*\n/g, "\n\n");
    }
    
    // Remove comments if requested
    if (this.options.ignoreComments) {
      processed = this.removeComments(processed, filePath);
    }
    
    return processed.trim();
  }

  /**
   * Remove comments from code based on file extension
   */
  private removeComments(code: string, filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case ".js":
      case ".jsx":
      case ".ts":
      case ".tsx":
        // Remove single-line comments
        code = code.replace(/\/\/.*$/gm, "");
        // Remove multi-line comments
        code = code.replace(/\/\*[\s\S]*?\*\//g, "");
        break;
        
      case ".py":
        // Remove Python comments
        code = code.replace(/#.*$/gm, "");
        // Remove docstrings (simple version)
        code = code.replace(/"""[\s\S]*?"""/g, "");
        code = code.replace(/'''[\s\S]*?'''/g, "");
        break;
        
      case ".go":
        // Remove Go comments
        code = code.replace(/\/\/.*$/gm, "");
        code = code.replace(/\/\*[\s\S]*?\*\//g, "");
        break;
        
      case ".java":
      case ".dart":
        // Remove Java/Dart comments
        code = code.replace(/\/\/.*$/gm, "");
        code = code.replace(/\/\*[\s\S]*?\*\//g, "");
        break;
    }
    
    return code;
  }
}