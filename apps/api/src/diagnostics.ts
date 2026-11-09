/** Safe diagnostic categories: never include SQL parameters, URLs, tokens or content. */
export function diagnostic(error: unknown) {
  const names: string[] = [];
  const messages: string[] = [];
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    names.push(current.name);
    messages.push(current.message);
    current = current.cause;
  }
  const text = messages.join('\n');
  const patterns: [RegExp, string][] = [
    [/FOREIGN KEY constraint failed/i, 'foreign_key_constraint'],
    [/UNIQUE constraint failed/i, 'unique_constraint'],
    [/CHECK constraint failed/i, 'check_constraint'],
    [/no such table/i, 'missing_table'],
    [/no such column/i, 'missing_column'],
    [/too many sql variables/i, 'sql_parameter_limit'],
    [/too many subrequests/i, 'subrequest_limit'],
    [/too many.*request/i, 'request_limit'],
    [/Invalid redirect value/i, 'unsupported_redirect_mode'],
    [/Cannot perform I\/O on behalf/i, 'cross_request_io'],
    [/overload|too many.*quer|SQLITE_BUSY/i, 'database_overloaded'],
    [/timeout|timed out/i, 'timeout'],
    [/undefined.*not supported|unsupported type|D1_TYPE_ERROR/i, 'sql_binding_type'],
    [/too large|size limit|SQLITE_TOOBIG/i, 'size_limit'],
    [/D1_ERROR|D1_EXEC_ERROR/i, 'database_error'],
  ];
  return {
    names,
    category: patterns.find(([pattern]) => pattern.test(text))?.[1] ?? 'unclassified',
    frames:
      error instanceof Error
        ? error.stack
            ?.split('\n')
            .filter((line) => /^\s*at /.test(line))
            .slice(0, 3)
            .map((line) => line.trim())
        : [],
  };
}
