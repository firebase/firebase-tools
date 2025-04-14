// eslint-disable-next-line @typescript-eslint/ban-types
type Primitive = number | string | null | undefined | Date | Function;

/**
 * Statically verify that one type implements another.
 * This is very useful to say assertImplements<fieldMasks, RecursiveKeyOf<T>>();
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
export function assertImplements<Test extends MaybeBase, MaybeBase>(): void {}

/**
 * RecursiveKeyOf is a type for keys of an objet usind dots for subfields.
 * For a given object: {a: {b: {c: number}}, d } the RecursiveKeysOf are
 * 'a' | 'a.b' | 'a.b.c' | 'd'
 */
export type RecursiveKeyOf<T> = T extends Primitive
  ? never
  : T extends (infer Elem)[]
    ? RecursiveSubKeys<Elem, keyof Elem & string>
    :
        | (keyof T & string)
        | {
            [P in keyof Required<T> & string]: RecursiveSubKeys<Required<T>, P>;
          }[keyof T & string];

type RecursiveSubKeys<T, P extends keyof T & string> = T[P] extends (infer Elem)[]
  ? `${P}.${RecursiveKeyOf<Elem>}`
  : T[P] extends object
    ? `${P}.${RecursiveKeyOf<T[P]>}`
    : never;

export type DeepExtract<RecursiveKeys extends string, Select extends string> = [
  RecursiveKeys extends `${infer Head}.${infer Rest}`
    ? Head extends Select
      ? Head
      : DeepExtract<TailsOf<RecursiveKeys, Head>, Rest>
    : Extract<RecursiveKeys, Select>,
][number];

/**
 * SameType is used in testing to verify that two types are the same.
 * Usage:
 * const test: SameType<A, B> = true.
 * The assigment will fail if the types are different.
 */
export type SameType<T, V> = T extends V ? (V extends T ? true : false) : false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type HeadOf<T extends string> = [T extends `${infer Head}.${infer Tail}` ? Head : T][number];

type TailsOf<T extends string, Head extends string> = [
  T extends `${Head}.${infer Tail}` ? Tail : never,
][number];

type RequiredFields<T> = {
  [K in keyof T as (object extends Pick<T, K> ? never : K) & string]: T[K];
};

type OptionalFields<T> = {
  [K in keyof T as (object extends Pick<T, K> ? K : never) & string]?: T[K];
};

/**
 * DeepOmit allows you to omit fields from a nested structure using recursive keys.
 */
export type DeepOmit<T extends object, Keys extends RecursiveKeyOf<T>> = DeepOmitUnsafe<T, Keys>;

type DeepOmitUnsafe<T, Keys extends string> = T extends (infer Elem)[]
  ? Array<DeepOmitUnsafe<Elem, Keys>>
  : {
      [Key in Exclude<keyof RequiredFields<T>, Keys>]: Key extends HeadOf<Keys>
        ? DeepOmitUnsafe<T[Key], TailsOf<Keys, Key>>
        : T[Key];
    } & {
      [Key in Exclude<keyof OptionalFields<T>, Keys>]?: Key extends HeadOf<Keys>
        ? DeepOmitUnsafe<T[Key], TailsOf<Keys, Key>>
        : T[Key];
    };

export type DeepPick<T extends object, Keys extends RecursiveKeyOf<T>> = DeepPickUnsafe<T, Keys>;

type DeepPickUnsafe<T, Keys extends string> = T extends (infer Elem)[]
  ? Array<DeepOmitUnsafe<Elem, Keys>>
  : {
      [Key in Extract<keyof RequiredFields<T>, HeadOf<Keys>>]: Key extends Keys
        ? T[Key]
        : DeepPickUnsafe<T[Key], TailsOf<Keys, Key>>;
    } & {
      [Key in Extract<keyof OptionalFields<T>, HeadOf<Keys>>]?: Key extends Keys
        ? T[Key]
        : DeepPickUnsafe<T[Key], TailsOf<Keys, Key>>;
    };

/**
 * Make properties of an object required.
 *
 * type Foo = {
 *     a?: string
 *     b?: number
 *     c?: object
 * }
 *
 * type Bar = RequireKeys<Foo, "a" | "b">
 * // Property "a" and "b" are now required.
 */
export type RequireKeys<T extends object, Keys extends keyof T> = T & Required<Pick<T, Keys>>;

/** In the array LeafElems<[[["a"], "b"], ["c"]]> is "a" | "b" | "c" */
export type LeafElems<T> =
  T extends Array<infer Elem> ? (Elem extends unknown[] ? LeafElems<Elem> : Elem) : T;

/**
 * In the object {a: number, b: { c: string } },
 * LeafValues is number | string
 */
export type LeafValues<T extends object> = {
  [Key in keyof T & string]: T[Key] extends object ? LeafValues<T[Key]> : T[Key];
}[keyof T & string];
