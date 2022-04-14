type Primitive = string | number | boolean | Function;

/**
 * RecursiveKeyOf is a type for keys of an objet usind dots for subfields.
 * For a given object: {a: {b: {c: number}}, d } the RecursiveKeysOf are
 * 'a' | 'a.b' | 'a.b.c' | 'd'
 */
export type RecursiveKeyOf<T> = T extends Primitive
  ? never
  :
      | (keyof T & string)
      | {
          [P in keyof T & string]: RecursiveSubKeys<T, P>;
        }[keyof T & string];

type RecursiveSubKeys<T, P extends keyof T & string> = T[P] extends (infer Elem)[]
  ? `${P}.${RecursiveKeyOf<Elem>}`
  : T[P] extends object
  ? `${P}.${RecursiveKeyOf<T[P]>}`
  : never;

/**
 * LeafKeysOf is like RecursiveKeysOf but omits the keys for any object.
 * For a given object: {a: {b: {c: number}}, d } the LeafKeysOf are
 * 'a.b.c' | 'd'
 */
export type LeafKeysOf<T extends object> = {
  [Key in keyof T & (string | number)]: T[Key] extends unknown[]
    ? `${Key}`
    : T[Key] extends object
    ? `${Key}.${RecursiveKeyOf<T[Key]>}`
    : `${Key}`;
}[keyof T & (string | number)];

/**
 * SameType is used in testing to verify that two types are the same.
 * Usage:
 * const test: SameType<A, B> = true.
 * The assigment will fail if the types are different.
 */
export type SameType<T, V> = T extends V ? (V extends T ? true : false) : false;

type HeadOf<T extends string> = [T extends `${infer Head}.${infer Tail}` ? Head : T][number];

type TailsOf<T extends string, Head extends string> = [
  T extends `${Head}.${infer Tail}` ? Tail : never
][number];

/**
 * DeepOmit allows you to omit fields from a nested structure using recursive keys.
 */
export type DeepOmit<T extends object, Keys extends RecursiveKeyOf<T>> = DeepOmitUnsafe<T, Keys>;

type DeepOmitUnsafe<T, Keys extends string> = {
  [Key in Exclude<keyof T, Keys>]: Key extends Keys
    ? T[Key] | undefined
    : Key extends HeadOf<Keys>
    ? DeepOmitUnsafe<T[Key], TailsOf<Keys, Key>>
    : T[Key];
};

export type DeepPick<T extends object, Keys extends RecursiveKeyOf<T>> = DeepPickUnsafe<T, Keys>;

type DeepPickUnsafe<T, Keys extends string> = {
  [Key in Extract<keyof T, HeadOf<Keys>>]: Key extends Keys
    ? T[Key]
    : DeepPickUnsafe<T[Key], TailsOf<Keys, Key>>;
};

/** In the array LeafElems<[[["a"], "b"], ["c"]]> is "a" | "b" | "c" */
export type LeafElems<T> = T extends Array<infer Elem>
  ? Elem extends unknown[]
    ? LeafElems<Elem>
    : Elem
  : T;

/**
 * In the object {a: number, b: { c: string } },
 * LeafValues is number | string
 */
export type LeafValues<T extends object> = {
  [Key in keyof T]: T[Key] extends object ? LeafValues<T[Key]> : T[Key];
}[keyof T];
