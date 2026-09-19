import { FirebaseError } from "../../error";
import { assertExhaustive } from "../../functional";
import { ParamValue } from "./params";

type CelExpression = string;
type IdentityExpression = CelExpression;
type ComparisonExpression = CelExpression;
type DualComparisonExpression = CelExpression;
type TernaryExpression = CelExpression;

type Literal = string | number | boolean | string[];
type L = "string" | "number" | "boolean" | "string[]";

const paramRegexp = /params\.(\S+)/;
const CMP = /((?:!=)|(?:==)|(?:>=)|(?:<=)|>|<)/.source; // !=, ==, >=, <=, >, <
const identityRegexp = /{{ params\.(\S+) }}/;
const dualComparisonRegexp = new RegExp(
  /{{ params\.(\S+) CMP params\.(\S+) }}/.source.replace("CMP", CMP),
);
const comparisonRegexp = new RegExp(/{{ params\.(\S+) CMP (.+) }}/.source.replace("CMP", CMP));

const exprPrefix = "{{ ";
const exprSuffix = " }}";
const questionToken = " ? ";
const colonToken = " : ";

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

export class ExprParseError extends FirebaseError {}

interface TernaryParts {
  condition: CelExpression;
  ifTrue: CelExpression;
  ifFalse: CelExpression;
}

type TernarySplit =
  // The body is a ternary and here are its parts.
  | ({ kind: "ternary" } & TernaryParts)
  // The body holds no delimiter, so it's one of the other forms of expression
  // or a terminal branch value.
  | { kind: "none" }
  // The body holds delimiters that don't pair up, so it's a broken ternary and
  // nothing else.
  | { kind: "malformed" };

type TernaryScan =
  | TernarySplit
  // The scan gave up because the body's quote characters don't line up with its
  // tokens, so nothing it worked out about literals can be trusted.
  | { kind: "misquoted" }
  // The body holds a " : " with no " ? " in front of it anywhere, so it isn't a
  // ternary at all rather than being a broken one.
  | { kind: "strayColon" };

/**
 * Tests whether a quote character sits where a string literal can start or end.
 *
 * The SDK writes every string operand as `"${value}"` without escaping the
 * value, so a value holding a double quote leaves quotes in the body that open
 * and close nothing. A quote that really does delimit a literal is at the edge
 * of a token, which means it's next to a space, a list bracket, a comma, or the
 * end of the body. Anything else is a value's own quote, and it means the scan
 * has lost track of where the literals are.
 */
function isLiteralEdge(body: string, i: number, closing: boolean): boolean {
  const neighbor = closing ? body[i + 1] : body[i - 1];
  return neighbor === undefined || [" ", ",", "[", "]"].includes(neighbor);
}

/**
 * Scans the body of an expression, meaning everything between the "{{ " and
 * the " }}", for the delimiters of a ternary.
 *
 * This can't be done with a regexp. Ternaries nest, the SDK emits them without
 * parentheses, and they associate to the right, so pairing a " ? " with the
 * " : " that belongs to it means counting delimiters. A quoted string literal
 * is also allowed to contain either token. Both of those need a left to right
 * scan.
 *
 * Quote tracking is skipped entirely when ignoreQuotes is set, which is how
 * splitTernary() copes with a body whose quotes don't line up.
 */
function scanTernary(body: string, ignoreQuotes: boolean): TernaryScan {
  let inLiteral = false;
  let depth = 0;
  let question = -1;
  let strayColon = false;
  const candidates: number[] = [];

  for (let i = 0; i < body.length; i++) {
    if (!ignoreQuotes) {
      if (inLiteral && body[i] === "\\") {
        i++; // whatever follows is escaped, so it's content and not a delimiter
        continue;
      }
      if (body[i] === '"') {
        if (!isLiteralEdge(body, i, inLiteral)) {
          return { kind: "misquoted" };
        }
        inLiteral = !inLiteral;
        continue;
      }
      if (inLiteral) {
        continue;
      }
    }
    if (body.startsWith(questionToken, i)) {
      if (question === -1) {
        question = i;
      } else {
        depth++;
      }
      i += questionToken.length - 1; // skip past the token we just consumed
      continue;
    }
    if (!body.startsWith(colonToken, i)) {
      continue;
    }
    if (question === -1) {
      // A branch delimiter with no condition delimiter in front of it. The scan
      // carries on, because whether a " ? " turns up later is what separates a
      // broken ternary from an expression that was never a ternary.
      strayColon = true;
    } else if (depth > 0) {
      depth--;
    } else {
      candidates.push(i);
    }
    i += colonToken.length - 1; // skip past the token we just consumed
  }

  if (inLiteral) {
    return { kind: "misquoted" };
  }
  if (question === -1) {
    return strayColon ? { kind: "strayColon" } : { kind: "none" };
  }
  if (strayColon) {
    // A " : " ahead of the " ? " belongs to neither this ternary nor a nested one.
    return { kind: "malformed" };
  }
  // Delimiters that pair up cleanly leave one candidate, because everything
  // after it is part of the false branch. More than one means a value's own
  // double quote hid the real delimiter from the scan and offered one of its
  // own, so a candidate that cuts a branch in half gives way to the next.
  for (const colon of candidates) {
    const ifTrue = body.slice(question + questionToken.length, colon);
    const ifFalse = body.slice(colon + colonToken.length);
    if (isSoundBranch(ifTrue) && isSoundBranch(ifFalse)) {
      return { kind: "ternary", condition: body.slice(0, question), ifTrue, ifFalse };
    }
  }
  // A condition delimiter that never found its branch delimiter is a broken
  // ternary. Calling it a non ternary would let the comparison evaluators
  // reinterpret it, and they'd return a boolean for whatever type was asked for.
  return { kind: "malformed" };
}

/**
 * Tests that a branch is something a ternary can really have as a branch: a
 * ternary itself, or a value with no delimiter left loose in it. A branch that
 * fails this was cut out of the middle of a value, which is what a value's own
 * double quote does to the scan.
 *
 * A loose " : " is read strictly here, unlike in splitTernary(), where it means
 * the body was never a ternary and belongs to another form of expression. A
 * branch has nowhere else to go, so the only thing a loose delimiter can tell
 * us is that the split which produced it was the wrong one.
 */
function isSoundBranch(branch: CelExpression): boolean {
  const scanned = scanTernary(branch, false);
  const kind = scanned.kind === "misquoted" ? scanTernary(branch, true).kind : scanned.kind;
  return kind === "ternary" || kind === "none";
}

/**
 * Splits the body of an expression as a ternary.
 *
 * A body holding a value with a double quote in it has quotes that delimit no
 * literal, and the scan says so rather than guessing which ones are real. The
 * regexps this replaced had no notion of quoting at all, so reading such a body
 * again with quote tracking off keeps those expressions resolving to what
 * they've always resolved to.
 */
function splitTernary(body: string): TernarySplit {
  const scanned = scanTernary(body, false);
  if (scanned.kind === "strayColon") {
    // The quotes line up, so this really is a branch delimiter with no
    // condition delimiter in front of it, which is a broken ternary.
    return { kind: "malformed" };
  }
  if (scanned.kind !== "misquoted") {
    return scanned;
  }
  const rescanned = scanTernary(body, true);
  if (rescanned.kind === "strayColon") {
    // Reading the quotes some other way is the only thing that could pair this
    // " : " up, and the scan has just given up on them, so the body goes to the
    // forms of expression that never had a notion of quoting. A comparison
    // against a value holding a " : " lands here and resolves as it always has.
    return { kind: "none" };
  }
  // The second scan doesn't track quoting, so it can't come back misquoted.
  return rescanned.kind === "misquoted" ? { kind: "none" } : rescanned;
}

/**
 * Pulls the body out of a whole CEL expression and splits it as a ternary,
 * returning null if the expression isn't a ternary. A ternary whose delimiters
 * don't pair up raises instead, so that it can't fall through to another form.
 */
function parseTernary(expr: CelExpression): TernaryParts | null {
  if (!expr.startsWith(exprPrefix) || !expr.endsWith(exprSuffix)) {
    return null;
  }
  const split = splitTernary(expr.slice(exprPrefix.length, -exprSuffix.length));
  if (split.kind === "malformed") {
    throw new ExprParseError("Malformed CEL ternary expression '" + expr + "'");
  }
  return split.kind === "ternary" ? split : null;
}

/**
 * Resolves a CEL expression of a supported form, guaranteeing the provided primitive type:
 * - {{ params.foo }}
 * - {{ params.foo <= 24 }}
 * - {{ params.foo != params.bar }}
 * - {{ params.foo == 24 ? "asdf" : params.jkl }}
 * - {{ params.foo > params.bar ? "asdf" : params.jkl }}
 * - {{ params.foo ? "asdf" : params.jkl }}, when foo is of boolean type
 * Either branch of a ternary can be a ternary itself, to any depth.
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
  // N.B: Some of these regexps are supersets of others (anything that is
  // params\.(\S+) is also (.+)), so the order in which they are tested matters.
  // The ternary is parsed ahead of the chain below, rather than tested inside
  // it, because the split it produces is reused to evaluate the expression.
  if (isIdentityExpression(expr)) {
    return resolveIdentity(wantType, expr, params);
  }
  const ternary = parseTernary(expr);
  if (ternary) {
    return resolveTernary(wantType, expr, ternary, params);
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
 *  {{ params.foo > params.bar ? "asdf" : params.jkl }}
 *  {{ params.foo ? "asdf" : params.jkl }}, when foo is of boolean type
 *  Either branch can be a ternary itself, to any depth.
 */
function resolveTernary(
  wantType: L,
  expr: TernaryExpression,
  parts: TernaryParts,
  params: Record<string, ParamValue>,
): Literal {
  const isTrue = resolveTernaryCondition(expr, parts.condition, params);
  return resolveTernaryBranch(wantType, expr, isTrue ? parts.ifTrue : parts.ifFalse, params);
}

/**
 * The condition of a ternary is one of the comparison forms, or a bare
 * reference to a param of boolean type.
 */
function resolveTernaryCondition(
  expr: TernaryExpression,
  condition: CelExpression,
  params: Record<string, ParamValue>,
): boolean {
  const conditionExpr = `${exprPrefix}${condition}${exprSuffix}`;
  if (isDualComparisonExpression(conditionExpr)) {
    return resolveDualComparison(conditionExpr, params);
  } else if (isComparisonExpression(conditionExpr)) {
    return resolveComparison(conditionExpr, params);
  }

  const match = identityRegexp.exec(conditionExpr);
  if (!match) {
    throw new ExprParseError(
      "CEL ternary expression '" + expr + "' is conditioned on an unsupported form",
    );
  }
  const paramName = match[1];
  const paramValue = params[paramName];
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
  return paramValue.asBoolean();
}

/**
 * A branch of a ternary is either another ternary or a terminal value: a
 * reference to a param, a list, or a literal. A branch left holding a delimiter
 * that pairs with nothing is neither, so it raises rather than being read as a
 * value with punctuation in it.
 */
function resolveTernaryBranch(
  wantType: L,
  expr: TernaryExpression,
  branch: CelExpression,
  params: Record<string, ParamValue>,
): Literal {
  const nested = splitTernary(branch);
  if (nested.kind === "malformed") {
    throw new ExprParseError("Malformed CEL ternary expression '" + expr + "'");
  }
  if (nested.kind === "ternary") {
    return resolveTernary(wantType, expr, nested, params);
  }
  // N.B: lists were already expanded by the preprocessLists() call that started
  // this resolution, so a branch must not be run through it a second time.
  return resolveParamListOrLiteral(wantType, branch, params);
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
    // by the preprocessLists() invocation at the beginning of CEL resolution, so
    // reaching the catch means something upstream handed this a fragment of one.
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ExprParseError("CEL literal " + value + " does not seem to be a list");
    }
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
