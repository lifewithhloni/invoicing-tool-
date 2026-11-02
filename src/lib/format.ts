/** Display formatting only. Never use these results in calculations. */

const randFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "652.25" → "R 652,25" (South African formatting). Input is a decimal string from the database. */
export function formatRand(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return randFormatter.format(Number(value));
}

/** "2026-10-31" → "31 Oct 2026". Dates are calendar dates, so no timezone shift is applied. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Today's date in South Africa as YYYY-MM-DD, for date-input defaults. */
export function todayInSouthAfrica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
}
