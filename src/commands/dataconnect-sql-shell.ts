import * as pg from "pg";
import * as ora from "ora";
import chalk from 'chalk';
import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";

import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickService } from "../dataconnect/fileUtils";
import { getIdentifiers } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { getIAMUser } from "../gcp/cloudsql/connect";
import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import { prompt, promptOnce, confirm, Question } from '../prompt';
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { FBToolsAuthClient } from "../gcp/cloudsql/fbToolsAuthClient";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Table = require("cli-table");

async function executeQuery(query: string, conn: pg.PoolClient) {
    const spinner = ora('Executing query...').start();
    try {
        const results = await conn.query(query);
        spinner.succeed(chalk.green('Query executed successfully'));

        if (Array.isArray(results.rows) && results.rows.length > 0) {
            const table = new Table({
                head: Object.keys(results.rows[0]).map(key => chalk.cyan(key)),
                style: { head: [], border: [] }
            });

            results.rows.forEach(row => {
                table.push(Object.values(row) as any);
            });

            logger.info(table.toString());
        } else {
            // If nothing is returned and the query was select, let the user know there was no results.
            if (query.toUpperCase().includes('SELECT'))
            logger.info(chalk.yellow('No results returned'));
        }
    } catch (err) {
        spinner.fail(chalk.red(`Failed executing query: ${err}`));
    }
}

const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'GRANT', 'CREATE', 'DROP'];

async function promptForQuery(): Promise<string> {
    const question: Question = {
        type: 'input',
        name: 'query',
        message: 'Enter your SQL query (or "exit" to quit):',
        transformer: (input: string) => {
          // Highlight SQL keywords
          return input.split(' ').map(word => 
            sqlKeywords.includes(word.toUpperCase()) ? chalk.cyan(word) : word
          ).join(' ');
        }
      };

    const { query } = await prompt({ nonInteractive: false }, [question]);
    return query;
}

async function confirmDangerousQuery(query: string): Promise<boolean> {
    if (query.toUpperCase().includes('DROP') || query.toUpperCase().includes('DELETE')) {
        return await confirm({
            message: chalk.yellow('This query may be destructive. Are you sure you want to proceed?'),
            default: false,
        });
    }
    return true;
}

export const command = new Command("dataconnect:sql:shell [serviceId]")
    .description(
        "Starts a shell connected directly to your cloudsql instance.",
    )
    .before(requirePermissions, [
        "firebasedataconnect.services.list",
        "cloudsql.instances.connect",
    ])
    .before(requireAuth)
    .action(async (serviceId: string, options: Options) => {
        const projectId = needProjectId(options);
        await ensureApis(projectId);
        const serviceInfo = await pickService(projectId, options.config, serviceId);

        const { serviceName, instanceId, instanceName, databaseId } = getIdentifiers(serviceInfo.schema);

        const { user:username, mode } = await getIAMUser(options);

        const instance = await cloudSqlAdminClient.getInstance(projectId, instanceId);

        const connectionName = instance.connectionName;
        if (!connectionName) {
            throw new FirebaseError(
                `Could not get instance connection string for ${options.instanceId}:${options.databaseId}`,
            );
        }

        let connector: Connector = new Connector({
            auth: new FBToolsAuthClient(),
        });
        const clientOpts = await connector.getOptions({
            instanceConnectionName: connectionName,
            ipType: IpAddressTypes.PUBLIC,
            authType: AuthTypes.IAM,
        });
        let pool: pg.Pool = new pg.Pool({
            ...clientOpts,
            user: username,
            database: databaseId,
        });

        const conn: pg.PoolClient = await pool.connect();
        logger.info(`Logged in as ${username}`);


        logger.info(chalk.cyan('Welcome to the GCP SQL Shell'));
        logger.info(chalk.gray('Type your SQL queries or "exit" to quit.\n'));

        
        while (true) {
            const query = await promptForQuery();
            if (query.toLowerCase() === 'exit') {
                break;
            }

            if (query == '') {
                continue;
            }

            if (await confirmDangerousQuery(query)) {
                await executeQuery(query, conn);
            } else {
                logger.info(chalk.yellow('Query cancelled.'));
            }
        }

        logger.info(chalk.yellow('Exiting shell...'));
        conn.release();
        await pool.end();
        connector.close();

        return { projectId, serviceId };
    });
