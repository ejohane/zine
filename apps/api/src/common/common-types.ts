export interface SuccessResult<T> {
  error: false;
  errorMsg: string;
  result: T;
}
export interface ErrorResult<T> {
  error: true;
  errorMsg: string;
  result: T;
}

export const SuccessResult = <T>(result: T): SuccessResult<T> => ({
  error: false,
  errorMsg: "",
  result,
});

export const ErrorResult = <T>(errorMsg: string): ErrorResult<T> =>
  ({
    error: true,
    errorMsg,
  }) as ErrorResult<T>;
