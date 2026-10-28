export interface Check {
  id: number;
  name: string;
  head_sha: string;
  status: string;
  conclusion: string;
  app?: { slug: string };
}
export function assertChecks(
  checks: Check[],
  sha: string,
  required: string[],
): boolean;
export function assertHead(actual: string, expected: string): void;
export function assertPublishedOrigin(urls: unknown, origin: string): void;
export function releaseStages(stages: {
  confirmHead: () => Promise<void>;
  preserve: () => Promise<void>;
  migrate: () => Promise<void>;
  deploy: () => Promise<string>;
}): Promise<string>;
export function assertEnvironment(
  config: {
    productionDatabase: string;
    previewDatabase: string;
    productionOrigin: string;
  },
  environment: string,
  actualDatabase: string,
  actualOrigin: string,
): void;
