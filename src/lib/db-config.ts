/** Returns true when the database is ready for the current environment. */
export function isProductionDbConfigured(): boolean {
  if (!process.env.VERCEL) return true;
  return !!(
    process.env.TURSO_DATABASE_URL?.trim() &&
    process.env.TURSO_AUTH_TOKEN?.trim()
  );
}

export function getDbConfigError(): string | null {
  if (!process.env.VERCEL) return null;
  if (!process.env.TURSO_DATABASE_URL?.trim()) {
    return "TURSO_DATABASE_URL is not set in Vercel environment variables.";
  }
  if (!process.env.TURSO_AUTH_TOKEN?.trim()) {
    return "TURSO_AUTH_TOKEN is not set in Vercel environment variables.";
  }
  const url = process.env.TURSO_DATABASE_URL;
  if (!url.startsWith("libsql://")) {
    return "TURSO_DATABASE_URL must start with libsql:// (not https://).";
  }
  return null;
}
