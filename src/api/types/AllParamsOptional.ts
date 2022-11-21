type AllParamsOptionalImpl<A extends any[], R> = A extends []
    ? (...args: A) => R
    : A extends [...infer Rest, unknown]
        ? ((...args: A) => R)|AllParamsOptionalImpl<Rest, R>
        : never;

export type AllParamsOptional<F extends (...args: any) => any> = F extends (...args: infer A) => infer R
    ? AllParamsOptionalImpl<A, R>
    : never;
