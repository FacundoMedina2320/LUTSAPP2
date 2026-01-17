import fs from "node:fs";
import path from "node:path";

const [csvPath, outPath] = process.argv.slice(2);

if (!csvPath || !outPath) {
  console.error("Usage: node scripts/manifest-from-csv.ts <input.csv> <output.json>");
  process.exit(1);
}

const csv = fs.readFileSync(csvPath, "utf8");
const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);

if (lines.length < 2) {
  console.error("CSV needs header + at least one row");
  process.exit(1);
}

const parseCsvLine = (line: string) => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
};

const header = parseCsvLine(lines[0]).map((field) => field.trim());

const parseBool = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
};

const parseTags = (value: string) => {
  if (!value.trim()) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const items = lines.slice(1).map((line) => {
  const values = parseCsvLine(line);
  const row: Record<string, string> = {};

  header.forEach((key, index) => {
    row[key] = (values[index] ?? "").trim();
  });

  return {
    slug: row.slug,
    name: row.name,
    description: row.description || null,
    category: row.category || null,
    tags: parseTags(row.tags || ""),
    is_premium: parseBool(row.is_premium || "false"),
    price_cents: row.price_cents ? Number(row.price_cents) : 0,
    currency: row.currency || "USD",
  };
});

const manifest = { items };
const output = JSON.stringify(manifest, null, 2);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output, "utf8");

console.log(`Wrote ${items.length} items to ${outPath}`);
