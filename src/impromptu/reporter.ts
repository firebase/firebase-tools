import * as fs from "fs-extra";
import * as path from "path";
import * as Table from "cli-table3";
import * as clc from "colorette";
import { logger } from "../logger";
import { logBullet, logSuccess, logWarning } from "../utils";
import {
  CaseResult,
  BenchmarkReport,
  BenchmarkSummary,
  AgentSummary,
  PromptSummary,
} from "./types";

/**
 * Reports benchmark results in various formats
 */
export class Reporter {
  private results: CaseResult[] = [];
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Log the start of a case
   */
  logCaseStart(promptId: string, caseId: string, agent: string): void {
    logBullet(
      `${clc.bold(clc.cyan("impromptu:"))} Running ${clc.bold(promptId)}/${clc.bold(caseId)} with ${clc.bold(agent)}...`
    );
  }

  /**
   * Log the completion of a case
   */
  logCaseComplete(result: CaseResult): void {
    const status = result.status === "success" ? clc.green("✓") : clc.red("✗");
    const duration = `${result.duration}ms`;
    
    if (result.status === "success") {
      const passedScorers = result.scorerResults.filter(s => s.passed).length;
      const totalScorers = result.scorerResults.length;
      logSuccess(
        `${status} ${result.promptId}/${result.caseId} (${result.agent}) - ${duration} - ${passedScorers}/${totalScorers} scorers passed`
      );
    } else if (result.status === "timeout") {
      logWarning(
        `${status} ${result.promptId}/${result.caseId} (${result.agent}) - Timeout after ${duration}`
      );
    } else {
      logger.error(
        `${status} ${result.promptId}/${result.caseId} (${result.agent}) - ${result.error || "Unknown error"}`
      );
    }
  }

  /**
   * Add a result
   */
  addResult(result: CaseResult): void {
    this.results.push(result);
    this.logCaseComplete(result);
  }

  /**
   * Generate and display summary
   */
  displaySummary(): void {
    const summary = this.generateSummary();
    
    // Overall summary
    logger.info("");
    logger.info(clc.bold("=== Impromptu Benchmark Summary ==="));
    logger.info(`Total cases: ${summary.totalCases}`);
    logger.info(`Overall score: ${summary.overallScore.toFixed(2)}%`);
    logger.info("");
    
    // Agent summary table
    const agentTable = new Table({
      head: ["Agent", "Total", "Passed", "Failed", "Errors", "Score"],
      style: { head: ["cyan"] },
    });
    
    for (const [agent, stats] of Object.entries(summary.byAgent)) {
      agentTable.push([
        agent,
        stats.totalCases.toString(),
        clc.green(stats.passed.toString()),
        clc.yellow(stats.failed.toString()),
        clc.red(stats.errors.toString()),
        `${stats.score.toFixed(2)}%`,
      ]);
    }
    
    logger.info(clc.bold("By Agent:"));
    logger.info(agentTable.toString());
    logger.info("");
    
    // Prompt summary table
    const promptTable = new Table({
      head: ["Prompt", "Total", "Passed", "Failed", ...Object.keys(summary.byAgent).map(a => `${a} %`)],
      style: { head: ["cyan"] },
    });
    
    for (const [prompt, stats] of Object.entries(summary.byPrompt)) {
      const row = [
        prompt,
        stats.totalCases.toString(),
        clc.green(stats.passed.toString()),
        stats.failed > 0 ? clc.yellow(stats.failed.toString()) : stats.failed.toString(),
      ];
      
      // Add per-agent scores
      for (const agent of Object.keys(summary.byAgent)) {
        const score = stats.byAgent[agent] || 0;
        row.push(`${score.toFixed(0)}%`);
      }
      
      promptTable.push(row);
    }
    
    logger.info(clc.bold("By Prompt:"));
    logger.info(promptTable.toString());
  }

  /**
   * Write detailed results to JSON file
   */
  async writeResults(outputDir: string): Promise<void> {
    await fs.ensureDir(outputDir);
    
    const report = await this.generateReport();
    
    // Write detailed JSON report
    const reportPath = path.join(outputDir, `impromptu-report-${Date.now()}.json`);
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    // Write summary markdown
    const summaryPath = path.join(outputDir, `impromptu-summary-${Date.now()}.md`);
    await fs.writeFile(summaryPath, this.generateMarkdownSummary(report));
    
    logger.info("");
    logger.info(`Results written to: ${outputDir}`);
    logger.info(`  - Report: ${path.basename(reportPath)}`);
    logger.info(`  - Summary: ${path.basename(summaryPath)}`);
  }

  /**
   * Generate full benchmark report
   */
  private async generateReport(): Promise<BenchmarkReport> {
    const gitSha = await this.getGitSha();
    
    return {
      timestamp: this.startTime,
      gitSha,
      config: {}, // TODO: Load actual config
      results: this.results,
      summary: this.generateSummary(),
    };
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(): BenchmarkSummary {
    const byAgent: Record<string, AgentSummary> = {};
    const byPrompt: Record<string, PromptSummary> = {};
    
    // Process results
    for (const result of this.results) {
      // Update agent summary
      if (!byAgent[result.agent]) {
        byAgent[result.agent] = {
          totalCases: 0,
          passed: 0,
          failed: 0,
          errors: 0,
          score: 0,
        };
      }
      
      const agentStats = byAgent[result.agent];
      agentStats.totalCases++;
      
      if (result.status === "success") {
        const allScorersPass = result.scorerResults.every(s => s.passed);
        if (allScorersPass) {
          agentStats.passed++;
        } else {
          agentStats.failed++;
        }
      } else {
        agentStats.errors++;
      }
      
      // Update prompt summary
      if (!byPrompt[result.promptId]) {
        byPrompt[result.promptId] = {
          totalCases: 0,
          passed: 0,
          failed: 0,
          byAgent: {},
        };
      }
      
      const promptStats = byPrompt[result.promptId];
      promptStats.totalCases++;
      
      if (result.status === "success") {
        const scorePercent = this.calculateCaseScore(result);
        promptStats.byAgent[result.agent] = scorePercent;
        
        if (result.scorerResults.every(s => s.passed)) {
          promptStats.passed++;
        } else {
          promptStats.failed++;
        }
      }
    }
    
    // Calculate agent scores
    for (const [agent, stats] of Object.entries(byAgent)) {
      if (stats.totalCases > 0) {
        stats.score = (stats.passed / stats.totalCases) * 100;
      }
    }
    
    // Calculate overall score
    let totalPassed = 0;
    let totalCases = 0;
    for (const stats of Object.values(byAgent)) {
      totalPassed += stats.passed;
      totalCases += stats.totalCases;
    }
    const overallScore = totalCases > 0 ? (totalPassed / totalCases) * 100 : 0;
    
    return {
      totalCases: this.results.length,
      byAgent,
      byPrompt,
      overallScore,
    };
  }

  /**
   * Calculate score for a single case
   */
  private calculateCaseScore(result: CaseResult): number {
    if (result.status !== "success" || result.scorerResults.length === 0) {
      return 0;
    }
    
    const passed = result.scorerResults.filter(s => s.passed).length;
    return (passed / result.scorerResults.length) * 100;
  }

  /**
   * Generate markdown summary
   */
  private generateMarkdownSummary(report: BenchmarkReport): string {
    const lines: string[] = [];
    
    lines.push("# Impromptu Benchmark Report");
    lines.push("");
    lines.push(`**Date:** ${report.timestamp.toISOString()}`);
    if (report.gitSha) {
      lines.push(`**Git SHA:** ${report.gitSha}`);
    }
    lines.push(`**Total Cases:** ${report.summary.totalCases}`);
    lines.push(`**Overall Score:** ${report.summary.overallScore.toFixed(2)}%`);
    lines.push("");
    
    // Agent summary
    lines.push("## Agent Performance");
    lines.push("");
    lines.push("| Agent | Total | Passed | Failed | Errors | Score |");
    lines.push("|-------|-------|--------|--------|--------|-------|");
    
    for (const [agent, stats] of Object.entries(report.summary.byAgent)) {
      lines.push(
        `| ${agent} | ${stats.totalCases} | ${stats.passed} | ${stats.failed} | ${stats.errors} | ${stats.score.toFixed(2)}% |`
      );
    }
    lines.push("");
    
    // Prompt summary
    lines.push("## Prompt Results");
    lines.push("");
    
    for (const [promptId, promptStats] of Object.entries(report.summary.byPrompt)) {
      lines.push(`### ${promptId}`);
      lines.push("");
      lines.push(`- Total cases: ${promptStats.totalCases}`);
      lines.push(`- Passed: ${promptStats.passed}`);
      lines.push(`- Failed: ${promptStats.failed}`);
      lines.push("");
      
      if (Object.keys(promptStats.byAgent).length > 0) {
        lines.push("Agent scores:");
        for (const [agent, score] of Object.entries(promptStats.byAgent)) {
          lines.push(`- ${agent}: ${score.toFixed(0)}%`);
        }
        lines.push("");
      }
    }
    
    // Detailed failures
    const failures = report.results.filter(r => r.status !== "success" || r.scorerResults.some(s => !s.passed));
    if (failures.length > 0) {
      lines.push("## Failures");
      lines.push("");
      
      for (const failure of failures) {
        lines.push(`### ${failure.promptId}/${failure.caseId} (${failure.agent})`);
        lines.push("");
        
        if (failure.error) {
          lines.push(`**Error:** ${failure.error}`);
          lines.push("");
        }
        
        const failedScorers = failure.scorerResults.filter(s => !s.passed);
        if (failedScorers.length > 0) {
          lines.push("Failed scorers:");
          for (const scorer of failedScorers) {
            lines.push(`- ${scorer.name}: ${scorer.error || "Failed"}`);
            if (scorer.details) {
              lines.push(`  Details: ${JSON.stringify(scorer.details)}`);
            }
          }
          lines.push("");
        }
      }
    }
    
    return lines.join("\n");
  }

  /**
   * Get current git SHA
   */
  private async getGitSha(): Promise<string | undefined> {
    try {
      const { spawnSync } = await import("child_process");
      const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
      if (result.status === 0) {
        return result.stdout.trim();
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }
}