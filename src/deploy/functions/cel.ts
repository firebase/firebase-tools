import { FirebaseError } from "../../error";
import { assertExhaustive } from "../../functional";
import { ParamValue } from "./params";

type CelExpression = string;
type IdentityExpression = CelExpression;
type EqualityExpression = CelExpression;
type DualEqualityExpression = CelExpression;
type TernaryExpression = CelExpression;
type LiteralTernaryExpression = CelExpression;
type DualTernaryExpression = CelExpression;

type Literal = string | number | boolean;
type L = "string" | "number" | "boolean";

const identityRegexp = /{{ params\.(\S+) }}/;
const dualEqualityRegexp = /{{ params\.(\S+) == params\.(\S+) }}/;
const equalityRegexp = /{{ params\.(\S+) == (.+) }}/;
const dualTernaryRegexp = /{{ params\.(\S+) == params\.(\S+) \? (.+) : (.+) }/;
const ternaryRegexp = /{{ params\.(\S+) == (.+) \? (.+) : (.+) }/;
const literalTernaryRegexp = /{{ params\.(\S+) \? (.+) : (.+) }/;
const paramRegexp = /params\.(\S+)/;

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
function isEqualityExpression(value: CelExpression): value is EqualityExpression {
  return equalityRegexp.test(value);
}
function isDualEqualityExpression(value: CelExpression): value is DualEqualityExpression {
  return dualEqualityRegexp.test(value);
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
 * - {{ params.foo == 24 }}
 * - {{ params.foo == params.bar }}
 * - {{ params.foo == 24 ? "asdf" : params.jkl }}
 * - {{ params.foo == params.bar ? "asdf" : params.jkl }}
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
  params: Record<string, ParamValue>
): Literal {
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
  } else if (isDualEqualityExpression(expr)) {
    return resolveDualEquality(expr, params);
  } else if (isEqualityExpression(expr)) {
    return resolveEquality(expr, params);
  } else {
    throw new ExprParseError("CEL expression '" + expr + "' is of an unsupported form");
  }
}

function assertType(wantType: L, paramName: string, paramValue: ParamValue) {
  if (
    (wantType === "string" && !paramValue.legalString) ||
    (wantType === "number" && !paramValue.legalNumber) ||
    (wantType === "boolean" && !paramValue.legalBoolean)
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
  params: Record<string, ParamValue>
): Literal {
  const match = identityRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL identity expression '" + expr + "'");
  }
  const name = match[1];
  const value = params[name];
  if (!value) {
    throw new ExprParseError(
      "CEL identity expression '" + expr + "' was not resolvable to a param"
    );
  }
  return readParamValue(wantType, name, value);
}

/**
 *  {{ params.foo == 24 }}
 */
function resolveEquality(expr: EqualityExpression, params: Record<string, ParamValue>): boolean {
  const match = equalityRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL equality expression '" + expr + "'");
  }

  const lhsName = match[1];
  const lhsVal = params[lhsName];
  if (!lhsVal) {
    throw new ExprParseError(
      "CEL equality expression '" + expr + "' references missing param " + lhsName
    );
  }
  let rhs: Literal;
  if (lhsVal.legalString) {
    rhs = resolveLiteral("string", match[2]);
    return lhsVal.asString() === rhs;
  } else if (lhsVal.legalNumber) {
    rhs = resolveLiteral("number", match[2]);
    return lhsVal.asNumber() === rhs;
  } else if (lhsVal.legalBoolean) {
    rhs = resolveLiteral("boolean", match[2]);
    return lhsVal.asBoolean() === rhs;
  } else {
    throw new ExprParseError(`Could not infer type of param ${lhsName} used in equality operation`);
  }
}

/**
 *  {{ params.foo == params.bar }}
 */
function resolveDualEquality(
  expr: EqualityExpression,
  params: Record<string, ParamValue>
): boolean {
  const match = dualEqualityRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL equality expression '" + expr + "'");
  }

  const lhsName = match[1];
  const lhsVal = params[lhsName];
  if (!lhsVal) {
    throw new ExprParseError(
      "CEL equality expression '" + expr + "' references missing param " + lhsName
    );
  }

  const rhsName = match[2];
  const rhsVal = params[rhsName];
  if (!rhsVal) {
    throw new ExprParseError(
      "CEL equality expression '" + expr + "' references missing param " + lhsName
    );
  }

  if (lhsVal.legalString) {
    if (!rhsVal.legalString) {
      throw new ExprParseError(
        `CEL equality expression ${expr} has type mismatch between the operands`
      );
    }
    return lhsVal.asString() === rhsVal.asString();
  } else if (lhsVal.legalNumber) {
    if (!rhsVal.legalNumber) {
      throw new ExprParseError(
        `CEL equality expression ${expr} has type mismatch between the operands`
      );
    }
    return lhsVal.asNumber() === rhsVal.asNumber();
  } else if (lhsVal.legalBoolean) {
    if (!rhsVal.legalBoolean) {
      throw new ExprParseError(
        `CEL equality expression ${expr} has type mismatch between the operands`
      );
    }
    return lhsVal.asBoolean() === rhsVal.asBoolean();
  } else {
    throw new ExprParseError(`could not infer type of param ${lhsName} used in equality operation`);
  }
}

/**
 *  {{ params.foo == 24 ? "asdf" : params.jkl }}
 */
function resolveTernary(
  wantType: L,
  expr: TernaryExpression,
  params: Record<string, ParamValue>
): Literal {
  const match = ternaryRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("malformed CEL ternary expression '" + expr + "'");
  }

  const equalityExpr = `{{ params.${match[1]} == ${match[2]} }}`;
  const isTrue = resolveEquality(equalityExpr, params);
  if (isTrue) {
    return resolveParamOrLiteral(wantType, match[3], params);
  } else {
    return resolveParamOrLiteral(wantType, match[4], params);
  }
}

/**
 *  {{ params.foo == params.bar ? "asdf" : params.jkl }}
 */
function resolveDualTernary(
  wantType: L,
  expr: DualTernaryExpression,
  params: Record<string, ParamValue>
): Literal {
  const match = dualTernaryRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL ternary expression '" + expr + "'");
  }

  const equalityExpr = `{{ params.${match[1]} == params.${match[2]} }}`;
  const isTrue = resolveDualEquality(equalityExpr, params);
  if (isTrue) {
    return resolveParamOrLiteral(wantType, match[3], params);
  } else {
    return resolveParamOrLiteral(wantType, match[4], params);
  }
}

/**
 *  {{ params.foo ? "asdf" : params.jkl }}
 *  only when the paramValue associated with params.foo is validBoolean
 */
function resolveLiteralTernary(
  wantType: L,
  expr: TernaryExpression,
  params: Record<string, ParamValue>
): Literal {
  const match = literalTernaryRegexp.exec(expr);
  if (!match) {
    throw new ExprParseError("Malformed CEL ternary expression '" + expr + "'");
  }

  const paramName = match[1];
  const paramValue = params[match[1]];
  if (!paramValue) {
    throw new ExprParseError(
      "CEL ternary expression '" + expr + "' references missing param " + paramName
    );
  }
  if (!paramValue.legalBoolean) {
    throw new ExprParseError(
      "CEL ternary expression '" + expr + "' is conditional on non-boolean param " + paramName
    );
  }

  if (paramValue.asBoolean()) {
    return resolveParamOrLiteral(wantType, match[2], params);
  } else {
    return resolveParamOrLiteral(wantType, match[3], params);
  }
}

function resolveParamOrLiteral(
  wantType: L,
  field: string,
  params: Record<string, ParamValue>
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
      "CEL tried to evaluate param." + value + " in a context which only permits literal values"
    );
  }

  if (wantType === "number") {
    if (isNaN(+value)) {
      throw new ExprParseError("CEL literal " + value + " does not seem to be a number");
    }
    return +value;
  } else if (wantType === "string") {
    if (!value.startsWith('"') || !value.endsWith('"')) {
      throw new ExprParseError(
        "CEL literal " + value + ' does not seem to be a "-delimited string'
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
      "CEL literal '" + value + "' somehow was resolved with a non-string/number/boolean type"
    );
  }
}
