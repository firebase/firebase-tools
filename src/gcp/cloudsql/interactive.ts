import * as pg from "pg";
import * as ora from "ora";
import * as clc from "colorette";
import { logger } from "../../logger";
import { confirm } from "../../prompt";
import * as Table from "cli-table3";

// Not comprehensive list, used for best offer prompting.
const destructiveSqlKeywords = ["DROP", "DELETE"];

function checkIsDestructiveSql(query: string): boolean {
  const upperCaseQuery = query.toUpperCase();
  return destructiveSqlKeywords.some((keyword) => upperCaseQuery.includes(keyword.toUpperCase()));
}

export async function confirmDangerousQuery(query: string): Promise<boolean> {
  if (checkIsDestructiveSql(query)) {
    return await confirm({
      message: clc.yellow("This query may be destructive. Are you sure you want to proceed?"),
      default: false,
    });
  }
  return true;
}

// Pretty query execution display such as spinner and actual returned content for `SELECT` query.
export async function interactiveExecuteQuery(query: string, conn: pg.PoolClient) {
  const spinner = ora("Executing query...").start();
  try {
    const results = await conn.query(query);
    spinner.succeed(clc.green("Query executed successfully"));

    if (Array.isArray(results.rows) && results.rows.length > 0) {
      const table: any[] = new Table({
        head: Object.keys(results.rows[0]).map((key) => clc.cyan(key)),
        style: { head: [], border: [] },
      });

      for (const row of results.rows) {
        table.push(Object.values(row) as any);
      }

      logger.info(table.toString());
    } else {
      // If nothing is returned and the query was select, let the user know there was no results.
      if (query.toUpperCase().includes("SELECT")) {
        logger.info(clc.yellow("No results returned"));
      }
    }
  } catch (err) {
    spinner.fail(clc.red(`Failed executing query: ${err}`));
  }
}
