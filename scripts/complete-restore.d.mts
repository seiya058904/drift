import type { ExecuteQuery, OperationConfig } from "./operations-lock.mjs";
export function completeRestore(
  config: OperationConfig,
  args: string[],
  env?: Record<string, string | undefined>,
  execute?: ExecuteQuery,
): Promise<void>;
