import { FirebaseError } from "../../error";
import { assertExhaustive } from "../../functional";

export type CelExpression = string;
export type IdentityExpression = CelExpression;
export type EqualityExpression = CelExpression;
export type TernaryExpression = CelExpression;

type Literal = string|number|boolean;
type L = String|Number|Boolean;

const identityRegexp = /{{ params\.(\w+) }}/;
const equalityRegexp = /{{ params\.(\w+) == (\w+) }}/;
const ternaryRegexp = /{{ (.*) == (.*) ? (\w+) : (\w+) }/;
const paramRegexp = /params\.(\w+)/;

export function isCelExpression(value: any): value is CelExpression {
  return (typeof value === 'string') && value.startsWith("{{") && value.endsWith("}}");
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

export function resolveExpression<T extends Literal>(ctor: new(...a: any) => L, expr: CelExpression, params: Record<string, Literal>): T {
  if (isIdentityExpression(expr)) {
    return resolveIdentity<T>(ctor, expr, params);
  } else if (isEqualityExpression(expr)) {
    return resolveEquality(expr, params);
  } else if (isTernaryExpression(expr)) {
    return resolveTernary<T>(ctor, expr, params);
  } else {
    throw new FirebaseError("CEL expression '" + expr + "' is of an unsupported form");
  }
}

function resolveIdentity<T extends Literal>(ctor: new(...a:any) => L, expr: IdentityExpression, params: Record<string, Literal>): T {
  var match = expr.match(identityRegexp);
  if (!match) {
    throw new FirebaseError("malformed CEL identity expression '" + expr + "'");
  }
  var value:any = params[match[1]];
  if (typeof value === 'undefined') {
    throw new FirebaseError("CEL identity expression '" + expr + "' was not resolvable to a param");
  } else if (!(value instanceof ctor)) {
    throw new FirebaseError("CEL identity expression '" + expr + "' resulted in illegal type coercion");
  }
  return value as unknown as T;
}

function resolveEquality(expr: EqualityExpression, params: Record<string, Literal>): boolean {
  var match = expr.match(equalityRegexp);
  if (!match) {
    throw new FirebaseError("malformed CEL equality expression '" + expr + "'");
  }

  var lhs = params[match[1]];
  let rhs:any;
  if (typeof lhs === 'undefined') {
    throw new FirebaseError("CEL equality expression LHS '" + match[1] + "' was not resolvable to a param");
  } else if (typeof lhs === 'string') {
    rhs = resolveLiteral<string>(String, match[2]);
  } else if (typeof lhs === 'number') {
    rhs = resolveLiteral<number>(Number, match[2]);
  } else if (typeof lhs === 'boolean') {
    rhs = resolveLiteral<boolean>(Boolean, match[2]);
  }

  return lhs == rhs;
}

function resolveTernary<T extends Literal>(ctor: new(...a:any) => L, expr: TernaryExpression, params: Record<string, Literal>) : T {
  var match = expr.match(ternaryRegexp);
  if (!match) {
    throw new FirebaseError("malformed CEL ternary expression '" + expr + "'");
  }

  // left-hand side of the ternary must be a params.FIELD, supporting any type
  // right-hand side must be a literal, not of type T but of the same type as the LHS
  var lhs = params[match[1]];
  let rhs:any;
  if (typeof lhs === 'undefined') {
    throw new FirebaseError("CEL equality expression LHS '" + match[1] + "' was not resolvable to a param");
  } else if (typeof lhs === 'string') {
    rhs = resolveLiteral<string>(String, match[2]);
  } else if (typeof lhs === 'number') {
    rhs = resolveLiteral<number>(Number, match[2]);
  } else if (typeof lhs === 'boolean') {
    rhs = resolveLiteral<boolean>(Boolean, match[2]);
  }

  if (lhs == rhs) {
    return resolveParamOrLiteral<T>(ctor, match[3], params);
  } else {
    return resolveParamOrLiteral<T>(ctor, match[4], params)
  }
}

function resolveParamOrLiteral<T extends Literal>(ctor: new(...a:any) => L, field: string, params: Record<string, Literal>) : T {
  var match = field.match(paramRegexp);
  if (!match) {
    return resolveLiteral<T>(ctor, field);
  } 
  var paramValue:any = params[match[1]];
  if (typeof paramValue === 'undefined') {
    throw new FirebaseError("CEL param field '" + field + "' was not provided");
  } else if (!(paramValue instanceof ctor)) {
    throw new FirebaseError("CEL param field '" + field + "' resulted in illegal type coercion");
  }
  return paramValue as unknown as T;
}

// TODO: error-checcking; there's no guarantee that value is actually sensibly convertable to T at this point in the call chain
function resolveLiteral<T extends Literal>(ctor: new(...a:any) => L, value: string) : T {
  if (new Number(0) instanceof ctor) {
    return parseInt(value) as T;
  } else if (new String("") instanceof ctor) {
    return value.slice(1, -1) as T;
  } else if (new Boolean(true) instanceof ctor) {
    if (value == "false") {
      return false as T;
    }
    return true as T;
  } else {
    throw new FirebaseError("CEL literal '" + value + "' somehow was called with a non-String/Number/Boolean construct signature");
  }
}
