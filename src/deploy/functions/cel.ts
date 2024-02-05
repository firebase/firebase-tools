import { FirebaseError } from "../../error";
import { assertExhaustive } from "../../functional";
import { ParamValue } from "./params";

type CelExpression = string;
type IdentityExpression = CelExpression;
type ComparisonExpression = CelExpression;
type DualComparisonExpression = CelExpression;
type TernaryExpression = CelExpression;
type LiteralTernaryExpression = CelExpression;
type DualTernaryExpression = CelExpression;

type Literal = string | number | boolean | string[];
type L = "string" | "number" | "boolean" | "string[]";

const paramRegexp = /params\.(\S+)/;
const CMP = /((?:!=)|(?:==)|(?:>=)|(?:<=)|>|<)/.source; // !=, ==, >=, <=, >, <
const identityRegexp = /{{ params\.(\S+) }}/;
const dualComparisonRegexp = new RegExp(
  /{{ params\.(\S+) CMP params\.(\S+) }}/.source.replace("CMP", CMP),
);
const comparisonRegexp = new RegExp(/{{ params\.(\S+) CMP (.+) }}/.source.replace("CMP", CMP));
const dualTernaryRegexp = new RegExp(
  /{{ params\.(\S+) CMP params\.(\S+) \? (.+) : (.+) }/.source.replace("CMP", CMP),
);
const ternaryRegexp = new RegExp(
  /{{ params\.(\S+) CMP (.+) \? (.+) : (.+) }/.source.replace("CMP", CMP),
);
const literalTernaryRegexp = /{{ params\.(\S+) \? (.+) : (.+) }/;

/**
 * An array equality test for use on resolved list literal ParamValues only;
 * skips a lot of the null/undefined/object-y/nested-list checks that something
 * like Underscore's isEqual() would make because args have to be string[].
 */
function listEquals(a: string[], b: string[]): boolean {
  return a.every((item) => b.includes(item)) && b.every((item) => a.includes(item));
}

/**
 * Determines if something is a string that looks vaguely like a CEL expression.
 * No guarantees as to whether it'll actually evaluate.
 */
export function isCelExpression(value: any): value is CelExpression {
  return typeof value === "string" && value.includes("{{") && value.includes("}}");
}
function isIdentityExpression(value: CelExpression): value is IdentityExpression {
  return identityRegexp.test(value);
}
function isComparisonExpression(value: CelExpression): value is ComparisonExpression {
  return comparisonRegexp.test(value);
}
function isDualComparisonExpression(value: CelExpression): value is DualComparisonExpression {
  return dualComparisonRegexp.test(value);
}
function isTernaryExpression(value: CelExpression): value is TernaryExpression {
  return ternaryRegexp.test(value);
}
function isLiteralTernaryExpression(value: CelExpression): value is LiteralTernaryExpression {
  return literalTernaryRegexp.test(value);
}
function isDualTernaryExpression(value: CelExpression): value is DualTernaryExpression {
  return dualTernaryRegexp.test(value);
}

export class ExprParseError extends FirebaseError {}

/**
 * Resolves a CEL expression of a supported form, guaranteeing the provided primitive type:
 * - {{ params.foo }}
 * - {{ params.foo <= 24 }}
 * - {{ params.foo != params.bar }}
 * - {{ params.foo == 24 ? "asdf" : params.jkl }}
 * - {{ params.foo > params.bar ? "asdf" : params.jkl }}
 * - {{ params.foo ? "asdf" : params.jkl }}, when foo is of boolean type
 * Values interpolated from params retain their type defined in the param;
 * it is an error to provide a CEL expression that coerces param types
 * (i.e testing equality between a IntParam and a BooleanParam). It is also
 * an error to provide a CEL expression that evaluates to a value of a type
 * other than provided as wantType.
 */
export function resolveExpression(
  wantType: L,
  expr: CelExpression,
  params: Record<string, ParamValue>,
): Literal {
  // N.B: List literals [] can contain CEL inside them, so we need to process them
  // first and resolve them. This isn't (and can't be) recursive, but the fact that
  // we only support string[] types mostly saves us here.
  expr = preprocessLists(wantType, expr, params);
  // N.B: Since some of these regexps are supersets of others--anything that is
  // params\.(\S+) is also (.+)--the order in which they are tested matters
  if (isIdentityExpression(expr)) {
    return resolveIdentity(wantType, expr, params);
  } else if (isDualTernaryExpression(expr)) {
    return resolveDualTernary(wantType, expr, params);
  } else if (isLiteralTernaryExpression(expr)) {
    return resolveLiteralTernary(wantType, expr, params);
  } else if (isTernaryExpression(expr)) {
    return resolveTernary(wantType, expr, params);
  } else if (isDualComparisonExpression(expr)) {
    return resolveDualComparison(expr, params);
  } else if (isComparisonExpression(expr)) {
    return resolveComparison(expr, params);
  } else {
    throw new ExprParseError("CEL expression '" + expr + "' is of an unsupported form");
  }
}

/**
 * Replaces all lists in a CEL expression string, which can contain string-type CEL
 * subexpressions or references to params, with their literal resolved values.
 * Not recursive.
 */
function preprocessLists(
  wantType: L,
  expr: CelExpression,
  params: Record<string, ParamValue>,
): CelExpression {
  let rv = expr;
  const listMatcher = /\[[^\[\]]*\]/g;
  let match: RegExpMatchArray | null;
  while ((match = listMatcher.exec(expr)) != null) {
    const list = match[0];
    const resolved = resolveList("string", list, params);
    rv = rv.replace(list, JSON.stringify(resolved));
  }
  return rv;
}

/**
 * A List in Functions CEL is a []-bracketed string with comma-separated values that can be:
 * - A double quoted string literal
 * - A reference to a param value (params.FOO) which must resolve with type string
 * - A sub-CEL expression {{ params.BAR == 0 ? "a" : "b" }} which must resolve with type string
 */
function resolveList(
  wantType: "string",
  list: string,
  params: Record<string, ParamValue>,
): string[] {
  if (!list.startsWith("[") || !list.endsWith("]")) {
    throw new ExprParseError("Invalid list: must start with '[' and end with ']'");
  } else if (list === "[]") {
    return [];
  }
  const rv: string[] = [];
  const entries = list.slice(1, -1).split(",");

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      rv.push(trimmed.slice(1, -1));
    } else if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
      rv.push(resolveExpression("string", trimmed, params) as string);
    } else {
      const paramMatch = paramRegexp.exec(trimmed);
      if (!paramMatch) {
        throw new ExprParseError(`Malformed list component ${trimmed}`);
      } else if (!(paramMatch[1] in params)) {
        throw new ExprParseError(`List expansion referenced nonexistent param ${paramMatch[1]}`);
      }
      rv.push(resolveParamListOrLiteral("string", trimmed, params) as string);
    }
  }

  return rv;
}

function assertType(wantType: L, paramName: string, paramValue: ParamValue) {
  if (
    (wantType === "string" && !paramValue.legalString) ||
    (wantType === "number" && !paramValue.legalNumber) ||
    (wantType === "boolean" && !paramValue.legalBoolean) ||
    (wantType === "string[]" && !paramValue.legalList)
  ) {
    throw new ExprParseError(`Illegal type coercion of param ${paramName} to type ${wantType}`);
  }
}
function readParamValue(wantType: L, paramName: string, paramValue: ParamValue): Literal {
  assertType(wantType, paramName, paramValue);
  if (wantType === "string") {
    return paramValue.asString();
  } else if (wantType === "number") {
    return paramValue.asNumber();
  } else if (wantType === "boolean") {
    return paramValue.asBoolean();
  } else if (wantType === "string[]") {
    return paramValue.asList();
  } else {
    assertExhaustive(wantType);
  }
}

/**
 *  {{ params.foo }}
 */
function resolveIdentity(
  wantType: L,
  expr: IdentityExpression,
  params: Record<string, ParamValue>,
): Literal {
  const match = identityRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL identity expression '" + expr + "'");
  }
  const name = match[1];
  const value = params[name];
  if (!value) {
    throw new ExprParseError(
      "CEL identity expression '" + expr + "' was not resolvable to a param",
    );
  }
  return readParamValue(wantType, name, value);
}

/**
 *  {{ params.foo <= 24 }}
 */
function resolveComparison(
  expr: ComparisonExpression,
  params: Record<string, ParamValue>,
): boolean {
  const match = comparisonRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL comparison expression '" + expr + "'");
  }

  const cmp = match[2];
  const test = function (a: Literal, b: Literal): boolean {
    switch (cmp) {
      case "!=":
        return Array.isArray(a) ? !listEquals(a, b as string[]) : a !== b;
      case "==":
        return Array.isArray(a) ? listEquals(a, b as string[]) : a === b;
      case ">=":
        return a >= b;
      case "<=":
        return a <= b;
      case ">":
        return a > b;
      case "<":
        return a < b;
      default:
        throw new ExprParseError("Illegal comparison operator '" + cmp + "'");
    }
  };

  const lhsName = match[1];
  const lhsVal = params[lhsName];
  if (!lhsVal) {
    throw new ExprParseError(
      "CEL comparison expression '" + expr + "' references missing param " + lhsName,
    );
  }
  let rhs: Literal;
  if (lhsVal.legalString) {
    rhs = resolveLiteral("string", match[3]);
    return test(lhsVal.asString(), rhs);
  } else if (lhsVal.legalNumber) {
    rhs = resolveLiteral("number", match[3]);
    return test(lhsVal.asNumber(), rhs);
  } else if (lhsVal.legalBoolean) {
    rhs = resolveLiteral("boolean", match[3]);
    return test(lhsVal.asBoolean(), rhs);
  } else if (lhsVal.legalList) {
    if (!["==", "!="].includes(cmp)) {
      throw new ExprParseError(
        `Unsupported comparison operation ${cmp} on list operands in expression ${expr}`,
      );
    }
    rhs = resolveLiteral("string[]", match[3]);
    return test(lhsVal.asList(), rhs);
  } else {
    throw new ExprParseError(
      `Could not infer type of param ${lhsName} used in comparison operation`,
    );
  }
}

/**
 *  {{ params.foo != params.bar }}
 */
function resolveDualComparison(
  expr: ComparisonExpression,
  params: Record<string, ParamValue>,
): boolean {
  const match = dualComparisonRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL comparison expression '" + expr + "'");
  }

  const cmp = match[2];
  const test = function (a: Literal, b: Literal): boolean {
    switch (cmp) {
      case "!=":
        return Array.isArray(a) ? !listEquals(a, b as string[]) : a !== b;
      case "==":
        return Array.isArray(a) ? listEquals(a, b as string[]) : a === b;
      case ">=":
        return a >= b;
      case "<=":
        return a <= b;
      case ">":
        return a > b;
      case "<":
        return a < b;
      default:
        throw new ExprParseError("Illegal comparison operator '" + cmp + "'");
    }
  };

  const lhsName = match[1];
  const lhsVal = params[lhsName];
  if (!lhsVal) {
    throw new ExprParseError(
      "CEL comparison expression '" + expr + "' references missing param " + lhsName,
    );
  }

  const rhsName = match[3];
  const rhsVal = params[rhsName];
  if (!rhsVal) {
    throw new ExprParseError(
      "CEL comparison expression '" + expr + "' references missing param " + lhsName,
    );
  }

  if (lhsVal.legalString) {
    if (!rhsVal.legalString) {
      throw new ExprParseError(
        `CEL comparison expression ${expr} has type mismatch between the operands`,
      );
    }
    return test(lhsVal.asString(), rhsVal.asString());
  } else if (lhsVal.legalNumber) {
    if (!rhsVal.legalNumber) {
      throw new ExprParseError(
        `CEL comparison expression ${expr} has type mismatch between the operands`,
      );
    }
    return test(lhsVal.asNumber(), rhsVal.asNumber());
  } else if (lhsVal.legalBoolean) {
    if (!rhsVal.legalBoolean) {
      throw new ExprParseError(
        `CEL comparison expression ${expr} has type mismatch between the operands`,
      );
    }
    return test(lhsVal.asBoolean(), rhsVal.asBoolean());
  } else if (lhsVal.legalList) {
    if (!rhsVal.legalList) {
      throw new ExprParseError(
        `CEL comparison expression ${expr} has type mismatch between the operands`,
      );
    }
    if (!["==", "!="].includes(cmp)) {
      throw new ExprParseError(
        `Unsupported comparison operation ${cmp} on list operands in expression ${expr}`,
      );
    }
    return test(lhsVal.asList(), rhsVal.asList());
  } else {
    throw new ExprParseError(
      `could not infer type of param ${lhsName} used in comparison operation`,
    );
  }
}

/**
 *  {{ params.foo == 24 ? "asdf" : params.jkl }}
 */
function resolveTernary(
  wantType: L,
  expr: TernaryExpression,
  params: Record<string, ParamValue>,
): Literal {
  const match = ternaryRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("malformed CEL ternary expression '" + expr + "'");
  }

  const comparisonExpr = `{{ params.${match[1]} ${match[2]} ${match[3]} }}`;
  const isTrue = resolveComparison(comparisonExpr, params);
  if (isTrue) {
    return resolveParamListOrLiteral(wantType, match[4], params);
  } else {
    return resolveParamListOrLiteral(wantType, match[5], params);
  }
}

/**
 *  {{ params.foo > params.bar ? "asdf" : params.jkl }}
 */
function resolveDualTernary(
  wantType: L,
  expr: DualTernaryExpression,
  params: Record<string, ParamValue>,
): Literal {
  const match = dualTernaryRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL ternary expression '" + expr + "'");
  }
  const comparisonExpr = `{{ params.${match[1]} ${match[2]} params.${match[3]} }}`;
  const isTrue = resolveDualComparison(comparisonExpr, params);
  if (isTrue) {
    return resolveParamListOrLiteral(wantType, match[4], params);
  } else {
    return resolveParamListOrLiteral(wantType, match[5], params);
  }
}

/**
 *  {{ params.foo ? "asdf" : params.jkl }}
 *  only when the paramValue associated with params.foo is validBoolean
 */
function resolveLiteralTernary(
  wantType: L,
  expr: TernaryExpression,
  params: Record<string, ParamValue>,
): Literal {
  const match = literalTernaryRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL ternary expression '" + expr + "'");
  }

  const paramName = match[1];
  const paramValue = params[match[1]];
  if (!paramValue) {
    throw new ExprParseError(
      "CEL ternary expression '" + expr + "' references missing param " + paramName,
    );
  }
  if (!paramValue.legalBoolean) {
    throw new ExprParseError(
      "CEL ternary expression '" + expr + "' is conditional on non-boolean param " + paramName,
    );
  }

  if (paramValue.asBoolean()) {
    return resolveParamListOrLiteral(wantType, match[2], params);
  } else {
    return resolveParamListOrLiteral(wantType, match[3], params);
  }
}

function resolveParamListOrLiteral(
  wantType: L,
  field: string,
  params: Record<string, ParamValue>,
): Literal {
  const match = paramRegexp.exec(field);
  if (!match) {
    return resolveLiteral(wantType, field);
  }
  const paramValue = params[match[1]];
  if (!paramValue) {
    throw new ExprParseError("CEL expression resolved to the value of a missing param " + match[1]);
  }
  return readParamValue(wantType, match[1], paramValue);
}

function resolveLiteral(wantType: L, value: string): Literal {
  if (paramRegexp.exec(value)) {
    throw new ExprParseError(
      "CEL tried to evaluate param." + value + " in a context which only permits literal values",
    );
  }

  if (wantType === "string[]") {
    // N.B: value being a literal list that can just be JSON.parsed should be guaranteed
    // by the preprocessLists() invocation at the beginning of CEL resolution
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new ExprParseError(`CEL tried to read non-list ${JSON.stringify(parsed)} as a list`);
    }
    for (const shouldBeString of parsed) {
      if (typeof shouldBeString !== "string") {
        throw new ExprParseError(
          `Evaluated CEL list ${JSON.stringify(parsed)} contained non-string values`,
        );
      }
    }
    return parsed as string[];
  } else if (wantType === "number") {
    if (isNaN(+value)) {
      throw new ExprParseError("CEL literal " + value + " does not seem to be a number");
    }
    return +value;
  } else if (wantType === "string") {
    if (!value.startsWith('"') || !value.endsWith('"')) {
      throw new ExprParseError(
        "CEL literal " + value + ' does not seem to be a "-delimited string',
      );
    }
    return value.slice(1, -1);
  } else if (wantType === "boolean") {
    if (value === "true") {
      return true;
    } else if (value === "false") {
      return false;
    } else {
      throw new ExprParseError("CEL literal " + value + "does not seem to be a true/false boolean");
    }
  } else {
    throw new ExprParseError(
      "CEL literal '" + value + "' somehow was resolved with a non-string/number/boolean type",
    );
  }
}
