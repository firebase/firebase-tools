import { logger } from "../logger";
import { LogEntry } from "../gcp/cloudlogging";

/**
 * The correct API filter to use when GCFv2 is enabled and/or we want specific function logs
 * @param functionList list of functions seperated by comma
 * @return the correct filter for use when calling the list api
 */
export function getApiFilter(controlPlane: boolean) {
  let baseFilter =
    'logName:("logs/cloudaudit.googleapis.com%2Factivity" OR "logs/cloudaudit.googleapis.com%2Fdata_access") ' +
    'protoPayload.serviceName="firebasedatabase.googleapis.com"';

  if (controlPlane) {
    baseFilter += '\nprotoPayload.authorizationInfo.permission!=("firebasedatabase.data.get" OR "firebasedatabase.data.update")';
  } else {
    baseFilter += '\nprotoPayload.authorizationInfo.permission=("firebasedatabase.data.get" OR "firebasedatabase.data.update")';
  }
  return baseFilter;
}

/**
 * Logs all entires with info severity to the CLI
 * @param entries a list of {@link LogEntry}
 */
export function logEntries(entries: LogEntry[]): void {
  if (!entries || entries.length === 0) {
    logger.info("No log entries found.");
    return;
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const timestamp = entry.timestamp || "---";
    const severity = (entry.severity || "?").substring(0, 1);
    const protoPayload = entry.protoPayload;
    const message = JSON.stringify({
      authenticationinfo: protoPayload.authenticationinfo,
      authorizationinfo: protoPayload.authorizationinfo,
    });
    logger.info(`${protoPayload.authenticationInfo.principalEmail}: ${JSON.stringify(protoPayload.authenticationInfo.thirdPartyPrincipal?.payload?.user_id)}`);
    for (const perm of protoPayload.authorizationInfo) {
      logger.info(`${perm.resource} ${perm.permission} ${perm.granted}`);
    }

    logger.info(`${timestamp} ${severity}: ${message}`);
  }
}
