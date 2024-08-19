import { FirebaseError } from "../error";

export interface ResourceFilter {
  serviceId: string;
  fullService?: boolean;
  schemaOnly?: boolean;
  connectorId?: string;
}

export function getResourceFilters(options: { only?: string }): ResourceFilter[] | undefined {
  if (!options.only) {
    return undefined;
  }

  const selectors = options.only.split(",");
  const filters: ResourceFilter[] = [];
  for (let selector of selectors) {
    if (selector.startsWith("dataconnect:")) {
      selector = selector.replace("dataconnect:", "");
      if (selector.length > 0) {
        filters.push(parseSelector(selector));
      }
    }
  }

  if (filters.length === 0) {
    return undefined;
  }
  return filters;
}

function parseSelector(selector: string): ResourceFilter {
  const parts = selector.split(":");
  const filter: ResourceFilter = {
    serviceId: parts[0],
  };
  if (parts.length === 2) {
    if (parts[1] === "schema") {
      filter.schemaOnly = true;
    } else {
      filter.connectorId = parts[1];
    }
  } else if (parts.length === 1) {
    filter.fullService = true;
  } else {
    throw new FirebaseError(`Invalid '--only' filter dataconnect:${selector}`);
  }
  return filter;
}

export function toString(rf: ResourceFilter) {
  const base = `dataconnect:${rf.serviceId}`;
  if (rf.connectorId) {
    return `${base}:${rf.connectorId}`;
  }
  if (rf.schemaOnly) {
    return `${base}:schema`;
  }
  return base;
}
