export function assertEnvironment(
  config,
  environment,
  actualDatabase,
  actualOrigin,
) {
  if (!["production", "preview"].includes(environment))
    throw Error("Unknown release environment");
  if (
    !config.productionDatabase ||
    !config.previewDatabase ||
    config.productionDatabase === config.previewDatabase
  )
    throw Error("Preview and production must use distinct databases");
  const expected =
    environment === "production"
      ? config.productionDatabase
      : config.previewDatabase;
  if (actualDatabase !== expected)
    throw Error("Database binding does not match release target");
  const url = new URL(actualOrigin);
  if (
    url.protocol !== "https:" ||
    url.origin !== actualOrigin ||
    actualOrigin.includes("*")
  )
    throw Error("An exact HTTPS Origin is required");
  if (environment === "preview" && actualOrigin === config.productionOrigin)
    throw Error("Preview Origin cannot be production");
}
export function assertChecks(checks, sha, required) {
  for (const name of required) {
    const matching = checks
      .filter(
        (c) =>
          c.name === name &&
          c.head_sha === sha &&
          c.app?.slug === "github-actions",
      )
      .sort((a, b) => b.id - a.id);
    const check = matching[0];
    if (!check || check.status !== "completed") return false;
    if (check.conclusion !== "success")
      throw Error(`Required check ${name} did not succeed`);
  }
  return true;
}
export function assertHead(actual, expected) {
  if (actual !== expected) throw Error("Stale build: branch HEAD changed");
}
