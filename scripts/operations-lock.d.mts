export interface OperationConfig {
  operationsDatabase: string;
  productionDatabase: string;
  previewDatabase: string;
}
export type ExecuteQuery = (
  database: string,
  sql: string,
  params?: (string | number)[],
) => Promise<{ results: Record<string, unknown>[] }[]>;
export function acquireOperationLock(
  database: string,
  environment: string,
  owner: string,
  execute?: ExecuteQuery,
): Promise<void>;
export function releaseOperationLock(
  database: string,
  environment: string,
  owner: string,
  execute?: ExecuteQuery,
): Promise<void>;
