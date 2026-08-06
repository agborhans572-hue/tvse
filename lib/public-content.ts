import { getD1 } from "../db";
import {
  destinationBySlug,
  destinationCatalog,
  packageBySlug,
  packageCatalog,
  type Destination,
  type TravelPackage,
} from "./catalog";

type DestinationRow = {
  id: string; slug: string; name: string; country: string; region: string;
  summary: string; description: string; image_path: string; best_time: string | null;
  highlights_json: string; featured: number;
};

type PackageRow = {
  id: string; slug: string; destination_slug: string | null; title: string;
  summary: string; description: string; duration_days: number; from_price_minor: number;
  currency: "KES" | "USD"; image_path: string; inclusions_json: string;
  exclusions_json: string; featured: number;
};

function stringList(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function destinationFromRow(row: DestinationRow): Destination {
  return { id: row.id, slug: row.slug, name: row.name, country: row.country, region: row.region,
    summary: row.summary, description: row.description, image: row.image_path,
    bestTime: row.best_time || "Year-round", highlights: stringList(row.highlights_json),
    featured: Boolean(row.featured) };
}

function packageFromRow(row: PackageRow): TravelPackage {
  return { id: row.id, slug: row.slug, destinationSlug: row.destination_slug || "", title: row.title,
    summary: row.summary, description: row.description, durationDays: row.duration_days,
    fromPriceMinor: row.from_price_minor, currency: row.currency, image: row.image_path,
    inclusions: stringList(row.inclusions_json), exclusions: stringList(row.exclusions_json),
    featured: Boolean(row.featured) };
}

export async function getPublishedDestinations() {
  try {
    const rows = await getD1().prepare("SELECT * FROM destinations WHERE status = 'published' ORDER BY featured DESC, name ASC").all<DestinationRow>();
    return rows.results.length ? rows.results.map(destinationFromRow) : destinationCatalog;
  } catch {
    return destinationCatalog;
  }
}

export async function getPublishedDestination(slug: string) {
  try {
    const row = await getD1().prepare("SELECT * FROM destinations WHERE slug = ? AND status = 'published'").bind(slug).first<DestinationRow>();
    return row ? destinationFromRow(row) : destinationBySlug(slug);
  } catch {
    return destinationBySlug(slug);
  }
}

export async function getPublishedPackages(destinationSlug?: string) {
  try {
    const base = "SELECT p.*, d.slug AS destination_slug FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id WHERE p.status = 'published'";
    const query = destinationSlug
      ? getD1().prepare(`${base} AND d.slug = ? ORDER BY p.featured DESC, p.title ASC`).bind(destinationSlug)
      : getD1().prepare(`${base} ORDER BY p.featured DESC, p.title ASC`);
    const rows = await query.all<PackageRow>();
    if (rows.results.length) return rows.results.map(packageFromRow);
  } catch {
    // Static content remains available during build and before the first migration.
  }
  return destinationSlug ? packageCatalog.filter((item) => item.destinationSlug === destinationSlug) : packageCatalog;
}

export async function getPublishedPackage(slug: string) {
  try {
    const row = await getD1().prepare("SELECT p.*, d.slug AS destination_slug FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id WHERE p.slug = ? AND p.status = 'published'").bind(slug).first<PackageRow>();
    return row ? packageFromRow(row) : packageBySlug(slug);
  } catch {
    return packageBySlug(slug);
  }
}
