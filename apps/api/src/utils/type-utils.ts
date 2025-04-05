export type ReplaceNullWithUndefined<T> = {
  [K in keyof T]: T[K] extends null
    ? undefined
    : T[K] extends infer U | null // Handle primitives OR null
      ? U | undefined
      : T[K] extends object
        ? ReplaceNullWithUndefined<T[K]> // Recursively handle objects
        : T[K];
};

export type NestedPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? NestedPartial<U>[]
    : T[P] extends object
      ? NestedPartial<T[P]>
      : T[P];
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
