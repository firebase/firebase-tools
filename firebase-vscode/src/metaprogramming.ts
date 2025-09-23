export type DeepReadOnly<T> = T extends Record<any, unknown>
  ? { readonly [K in keyof T]: DeepReadOnly<T[K]> }
  : T extends Array<any>
  ? ReadonlyArray<DeepReadOnly<T[number]>>
  : T;
