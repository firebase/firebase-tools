import { FirebaseError } from "../../error";
import { assertExhaustive } from "../../functional";

export type CelExpression = string;
export type IdentityExpression = CelExpression;
export type EqualityExpression = CelExpression;
export type TernaryExpression = CelExpression;

export type Literal = string | number | boolean;
type L = "string" | "number" | "boolean";

const identityRegexp = /{{ params\.(\S+) }}/;
const equalityRegexp = /{{ params\.(\S+) == (.+) }}/;
const ternaryRegexp = /{{ params\.(\S+) == (.+) ? (.+) : (.+) }/;
const paramRegexp = /params\.(\S+)/;

export function isCelExpression(value: any): value is CelExpression {
  return typeof value === "string" && value.startsWith("{{") && value.endsWith("}}");
}
function isIdentityExpression(value: CelExpression): value is IdentityExpression {
  return identityRegexp.test(value);
}
function isEqualityExpression(value: CelExpression): value is EqualityExpression {
  return equalityRegexp.test(value);
}
function isTernaryExpression(value: CelExpression): value is TernaryExpression {
  return ternaryRegexp.test(value);
}

export function resolveExpression(
  wantType: L,
  expr: CelExpression,
  params: Record<string, Literal>
): Literal {
  if (isIdentityExpression(expr)) {
    return resolveIdentity(wantType, expr, params);
  } else if (isTernaryExpression(expr)) {
    return resolveTernary(wantType, expr, params);
  } else if (isEqualityExpression(expr)) {
    return resolveEquality(expr, params);
  } else {
    throw new FirebaseError("CEL expression '" + expr + "' is of an unsupported form");
  }
}

function resolveIdentity(
  wantType: L,
  expr: IdentityExpression,
  params: Record<string, Literal>
): Literal {
  const match = identityRegexp.exec(expr);
  if (!match) {
    throw new FirebaseError("malformed CEL identity expression '" + expr + "'");
  }
  const value: any = params[match[1]];
  if (typeof value === "undefined") {
    throw new FirebaseError("CEL identity expression '" + expr + "' was not resolvable to a param");
  }
  if (typeof value !== wantType) {
    throw new FirebaseError(
      "CEL identity expression '" + expr + "' resulted in illegal type coercion"
    );
  }
  return value;
}

function resolveEquality(expr: EqualityExpression, params: Record<string, Literal>): boolean {
  const match = equalityRegexp.exec(expr);
  if (!match) {
    throw new FirebaseError("malformed CEL equality expression '" + expr + "'");
  }

  const lhs = params[match[1]];
  let rhs: Literal;
  if (typeof lhs === "undefined") {
    throw new FirebaseError(
      "CEL equality expression LHS '" + match[1] + "' was not resolvable to a param"
    );
  } else if (typeof lhs === "string") {
    rhs = resolveLiteral("string", match[2]);
  } else if (typeof lhs === "number") {
    rhs = resolveLiteral("number", match[2]);
  } else if (typeof lhs === "boolean") {
    rhs = resolveLiteral("boolean", match[2]);
  } else {
    assertExhaustive(lhs);
  }

  return lhs === rhs;
}

function resolveTernary(
  wantType: L,
  expr: TernaryExpression,
  params: Record<string, Literal>
): Literal {
  const match = ternaryRegexp.exec(expr);
  if (!match) {
    throw new FirebaseError("malformed CEL ternary expression '" + expr + "'");
  }

  // left-hand side of the ternary must be a params.FIELD, supporting any type
  // right-hand side must be a literal, not of type T but of the same type as the LHS
  const lhs = params[match[1]];
  let rhs: Literal;
  if (typeof lhs === "undefined") {
    throw new FirebaseError(
      "CEL ternary expression LHS params.'" + match[1] + "' was not resolvable to a param"
    );
  } else if (typeof lhs === "string") {
    rhs = resolveLiteral("string", match[2]);
  } else if (typeof lhs === "number") {
    rhs = resolveLiteral("number", match[2]);
  } else if (typeof lhs === "boolean") {
    rhs = resolveLiteral("boolean", match[2]);
  } else {
    assertExhaustive(lhs);
  }

  if (lhs === rhs) {
    return resolveParamOrLiteral(wantType, match[3], params);
  } else {
    return resolveParamOrLiteral(wantType, match[4], params);
  }
}

function resolveParamOrLiteral(
  wantType: L,
  field: string,
  params: Record<string, Literal>
): Literal {
  const match = paramRegexp.exec(field);
  if (!match) {
    return resolveLiteral(wantType, field);
  }
  const paramValue = params[match[1]];
  if (typeof paramValue === "undefined") {
    throw new FirebaseError("CEL param field '" + field + "' was not provided");
  }
  if (typeof paramValue !== wantType) {
    throw new FirebaseError("CEL param field '" + field + "' resulted in illegal type coercion");
  }
  return paramValue;
}

// TODO: error-checcking; there's no guarantee that value is actually sensibly convertable to T at this point in the call chain
function resolveLiteral(wantType: L, value: string): Literal {
  if (paramRegexp.exec(value)) {
    throw new FirebaseError(
      "CEL tried to evaluate param." + value + " in a context which only permits literal values"
    );
  }

  if (wantType === "number") {
    return parseInt(value);
  } else if (wantType === "string") {
    return value.slice(1, -1);
  } else if (wantType === "boolean") {
    if (value === "false") {
      return false;
    }
    return true;
  } else {
    throw new FirebaseError(
      "CEL literal '" + value + "' somehow was resolved with a non-string/number/boolean type"
    );
  }
}
