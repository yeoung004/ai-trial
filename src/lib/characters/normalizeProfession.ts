export function normalizeProfession(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
