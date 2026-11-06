import type { ExecuteQuery, OperationConfig } from "./operations-lock.mjs";
export function restoreDatabase(
  config: OperationConfig,
  args: string[],
  dependencies?: {
    env?: Record<string, string | undefined>;
    preserve?: (config: OperationConfig, environment: string, label: string) => unknown;
    restore?: (...args: string[]) => unknown;
    execute?: ExecuteQuery;
    log?: (...values: unknown[]) => void;
  },
): Promise<string>;
