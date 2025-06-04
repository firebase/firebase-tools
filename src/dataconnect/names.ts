import { FirebaseError } from "../error";

interface serviceName {
  projectId: string;
  location: string;
  serviceId: string;
  toString(): string;
}

const serviceNameRegex =
  /projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/services\/(?<serviceId>[^\/]+)/;

export function parseServiceName(serviceName: string): serviceName {
  const res = serviceNameRegex.exec(serviceName);
  const projectId = res?.groups?.projectId;
  const location = res?.groups?.location;
  const serviceId = res?.groups?.serviceId;
  if (!projectId || !location || !serviceId) {
    throw new FirebaseError(`${serviceName} is not a valid service name`);
  }
  const toString = () => {
    return `projects/${projectId}/locations/${location}/services/${serviceId}`;
  };
  return {
    projectId,
    location,
    serviceId,
    toString,
  };
}

interface connectorName {
  projectId: string;
  location: string;
  serviceId: string;
  connectorId: string;
  toString(): string;
}

const connectorNameRegex =
  /projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/services\/(?<serviceId>[^\/]+)\/connectors\/(?<connectorId>[^\/]+)/;

export function parseConnectorName(connectorName: string): connectorName {
  const res = connectorNameRegex.exec(connectorName);
  const projectId = res?.groups?.projectId;
  const location = res?.groups?.location;
  const serviceId = res?.groups?.serviceId;
  const connectorId = res?.groups?.connectorId;
  if (!projectId || !location || !serviceId || !connectorId) {
    throw new FirebaseError(`${connectorName} is not a valid connector name`);
  }
  const toString = () => {
    return `projects/${projectId}/locations/${location}/services/${serviceId}/connectors/${connectorId}`;
  };
  return {
    projectId,
    location,
    serviceId,
    connectorId,
    toString,
  };
}

interface cloudSQLInstanceName {
  projectId: string;
  location: string;
  instanceId: string;
  toString(): string;
}

const cloudSQLInstanceNameRegex =
  /projects\/(?<projectId>[^\/]+)\/locations\/(?<location>[^\/]+)\/instances\/(?<instanceId>[^\/]+)/;

export function parseCloudSQLInstanceName(cloudSQLInstanceName: string): cloudSQLInstanceName {
  const res = cloudSQLInstanceNameRegex.exec(cloudSQLInstanceName);
  const projectId = res?.groups?.projectId;
  const location = res?.groups?.location;
  const instanceId = res?.groups?.instanceId;
  if (!projectId || !location || !instanceId) {
    throw new FirebaseError(`${cloudSQLInstanceName} is not a valid cloudSQL instance name`);
  }
  const toString = () => {
    return `projects/${projectId}/locations/${location}/services/${instanceId}`;
  };
  return {
    projectId,
    location,
    instanceId,
    toString,
  };
}
