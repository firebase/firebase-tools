import { CustomType, GraphqlError } from "./types";

export function validateCustomTypes(
  types: Record<string, CustomType>
): GraphqlError[] {
  const errors: GraphqlError[] = [];

  Object.entries(types).forEach(([name, type]) => {
    if (!type.sqlType || !type.graphqlType) {
      errors.push({
        message: `Custom type "${name}": Missing required fields in type definition`,
      });
      return;
    }

    try {
      new Function("value", type.serialize);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({
        message: `Custom type "${name}": Invalid serialize function: ${message}`,
      });
    }

    try {
      new Function("value", type.parseValue);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({
        message: `Custom type "${name}": Invalid parseValue function: ${message}`,
      });
    }
  });

  return errors;
}

export function validateResolvers(
  resolvers: Record<string, string>
): GraphqlError[] {
  const errors: GraphqlError[] = [];

  Object.entries(resolvers).forEach(([field, resolver]) => {
    try {
      new Function("parent", "args", "context", "info", resolver);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({
        message: `Resolver "${field}": Invalid resolver function: ${message}`,
      });
    }
  });

  return errors;
}