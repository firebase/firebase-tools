import { diffLines } from "diff";
import * as crypto from "crypto";

export class MyersDiffEngine {
  /**
   * Calculates a similarity score between 0.0 and 1.0 based on line differences.
   */
  public static getSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 && b.length === 0) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    // Fast-path: hash comparison
    const hashA = crypto.createHash("sha256").update(a).digest("hex");
    const hashB = crypto.createHash("sha256").update(b).digest("hex");
    if (hashA === hashB) return 1.0;

    const changes = diffLines(a, b);
    let matchedLines = 0;
    let totalLinesA = 0;
    let totalLinesB = 0;

    for (const change of changes) {
      const count = change.count || 0;
      if (!change.added && !change.removed) {
        matchedLines += count;
        totalLinesA += count;
        totalLinesB += count;
      } else if (change.added) {
        totalLinesB += count;
      } else if (change.removed) {
        totalLinesA += count;
      }
    }

    const totalLines = totalLinesA + totalLinesB;
    if (totalLines === 0) return 1.0;

    return (2 * matchedLines) / totalLines;
  }
}
