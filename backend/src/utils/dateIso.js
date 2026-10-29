// dateStrings:true makes mysql2 return DATETIME/TIMESTAMP columns as zoneless
// "YYYY-MM-DD HH:MM:SS" strings, which are UTC here. API responses carry them as
// ISO-8601 UTC so a browser does not read them as its own local time.

/** DB datetime (UTC, dateStrings) or Date → ISO-8601 UTC string. */
export const toIso = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  if (s.includes("T")) return s;
  const m = s.replace(" ", "T");
  return /\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(m) ? `${m}Z` : m;
};
