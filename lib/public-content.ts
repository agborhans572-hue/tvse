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

export type PublishedEntry = {
  id: string;
  type: "article" | "guide";
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  imagePath: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: number | null;
};

type ContentRow = {
  id: string; type: "article" | "guide"; slug: string; title: string; excerpt: string; body: string;
  image_path: string | null; seo_title: string | null; seo_description: string | null; published_at: number | null;
};

const fallbackEntries:PublishedEntry[]=[
  {id:"cnt_zanzibar",type:"article",slug:"zanzibar-beyond-the-beach",title:"Zanzibar beyond the beach",excerpt:"Culture, food and island history worth adding to your stay.",body:"Stone Town, spice farms and dhow traditions add texture to an Indian Ocean escape.\n\nTVSE can pair these stories with time to slow down on the coast, matching the pace and style of stay to your journey.",imagePath:"/hero-zanzibar.jpg",seoTitle:"Zanzibar beyond the beach | TVSE",seoDescription:"Culture, food and island history for a more thoughtful Zanzibar journey.",publishedAt:1785997500000},
  {id:"cnt_policy",type:"guide",slug:"build-a-travel-policy",title:"Build a travel policy people will actually use",excerpt:"Practical guardrails that help travelers and finance teams.",body:"Start with the journeys people actually take, make the preferred choice the easiest choice and explain the reason behind each rule.\n\nReview the policy with travelers, approvers and finance before launch, then improve it using the questions your teams actually ask.",imagePath:"/bali.jpg",seoTitle:"Build a practical travel policy | TVSE",seoDescription:"A practical guide to travel policy that supports travelers and finance teams.",publishedAt:1785997500000},
  {id:"cnt_mara",type:"guide",slug:"when-to-book-maasai-mara",title:"When to book the Maasai Mara",excerpt:"A month-by-month view of wildlife, weather and camp atmosphere.",body:"Your best time depends on more than the migration. TVSE matches season, conservancy and camp style to the experience you want.\n\nBook around your priorities: dramatic crossings, quieter wildlife viewing, family timing or photographic light.",imagePath:"/maasai-mara.jpg",seoTitle:"When to book the Maasai Mara | TVSE",seoDescription:"Plan the right Maasai Mara season for your safari priorities.",publishedAt:1785997500000},
];

function entryFromRow(row: ContentRow): PublishedEntry {
  return { id: row.id, type: row.type, slug: row.slug, title: row.title, excerpt: row.excerpt, body: row.body, imagePath: row.image_path, seoTitle: row.seo_title, seoDescription: row.seo_description, publishedAt: row.published_at };
}

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
    const rows = await getD1().prepare("SELECT id,slug,name,country,region,summary,description,image_path,best_time,highlights_json,featured FROM destinations WHERE status = 'published' ORDER BY featured DESC, name ASC").all<DestinationRow>();
    return rows.results.length ? rows.results.map(destinationFromRow) : destinationCatalog;
  } catch (error) {
    if (databaseWasBound()) throw error;
    return destinationCatalog;
  }
}

export async function getPublishedDestination(slug: string) {
  try {
    const row = await getD1().prepare("SELECT id,slug,name,country,region,summary,description,image_path,best_time,highlights_json,featured FROM destinations WHERE slug = ? AND status = 'published'").bind(slug).first<DestinationRow>();
    return row ? destinationFromRow(row) : destinationBySlug(slug);
  } catch (error) {
    if (databaseWasBound()) throw error;
    return destinationBySlug(slug);
  }
}

export async function getPublishedPackages(destinationSlug?: string) {
  try {
    const base = "SELECT p.id,p.slug,d.slug AS destination_slug,p.title,p.summary,p.description,p.duration_days,p.from_price_minor,p.currency,p.image_path,p.inclusions_json,p.exclusions_json,p.featured FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id WHERE p.status = 'published'";
    const query = destinationSlug
      ? getD1().prepare(`${base} AND d.slug = ? ORDER BY p.featured DESC, p.title ASC`).bind(destinationSlug)
      : getD1().prepare(`${base} ORDER BY p.featured DESC, p.title ASC`);
    const rows = await query.all<PackageRow>();
    if (rows.results.length) return rows.results.map(packageFromRow);
  } catch (error) {
    if (databaseWasBound()) throw error;
  }
  return destinationSlug ? packageCatalog.filter((item) => item.destinationSlug === destinationSlug) : packageCatalog;
}

export async function getPublishedPackage(slug: string) {
  try {
    const row = await getD1().prepare("SELECT p.id,p.slug,d.slug AS destination_slug,p.title,p.summary,p.description,p.duration_days,p.from_price_minor,p.currency,p.image_path,p.inclusions_json,p.exclusions_json,p.featured FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id WHERE p.slug = ? AND p.status = 'published'").bind(slug).first<PackageRow>();
    return row ? packageFromRow(row) : packageBySlug(slug);
  } catch (error) {
    if (databaseWasBound()) throw error;
    return packageBySlug(slug);
  }
}

export async function getPublishedEntries(type?: "article" | "guide") {
  try {
    const query = type
      ? getD1().prepare("SELECT id,type,slug,title,excerpt,body,image_path,seo_title,seo_description,published_at FROM content_entries WHERE status='published' AND type=? ORDER BY published_at DESC, title").bind(type)
      : getD1().prepare("SELECT id,type,slug,title,excerpt,body,image_path,seo_title,seo_description,published_at FROM content_entries WHERE status='published' ORDER BY published_at DESC, title");
    const rows=(await query.all<ContentRow>()).results.map(entryFromRow);
    return rows.length?rows:fallbackEntries.filter((entry)=>!type||entry.type===type);
  } catch (error) {
    if (databaseWasBound()) throw error;
    return fallbackEntries.filter((entry)=>!type||entry.type===type);
  }
}

export async function getPublishedEntry(type: "article" | "guide", slug: string) {
  try {
    const row = await getD1().prepare("SELECT id,type,slug,title,excerpt,body,image_path,seo_title,seo_description,published_at FROM content_entries WHERE status='published' AND type=? AND slug=?").bind(type, slug).first<ContentRow>();
    return row ? entryFromRow(row) : fallbackEntries.find((entry)=>entry.type===type&&entry.slug===slug)??null;
  } catch (error) {
    if (databaseWasBound()) throw error;
    return fallbackEntries.find((entry)=>entry.type===type&&entry.slug===slug)??null;
  }
}

export type SearchResult = { type: "destination" | "package" | "article" | "guide"; slug: string; title: string; summary: string; href: string; imagePath: string | null };

export async function searchPublishedContent(query: string): Promise<SearchResult[]> {
  const terms = tokenize(query).slice(0, 6);
  if (!terms.length) return [];
  try {
    const placeholders = terms.map(() => "?").join(",");
    const bindings = terms;
    const rows = await getD1().prepare(`
      WITH matches AS (
        SELECT entity_type, entity_id, SUM(weight) AS score
        FROM content_search_terms WHERE term IN (${placeholders})
        GROUP BY entity_type, entity_id
      )
      SELECT 'destination' AS type,d.slug,d.name AS title,d.summary,'/destinations/'||d.slug AS href,d.image_path,m.score
      FROM matches m JOIN destinations d ON m.entity_type='destination' AND d.id=m.entity_id WHERE d.status='published'
      UNION ALL
      SELECT 'package',p.slug,p.title,p.summary,'/packages/'||p.slug,p.image_path,m.score
      FROM matches m JOIN packages p ON m.entity_type='package' AND p.id=m.entity_id WHERE p.status='published'
      UNION ALL
      SELECT c.type,c.slug,c.title,c.excerpt,CASE WHEN c.type='article' THEN '/resources/blog/'||c.slug ELSE '/resources/guides/'||c.slug END,c.image_path,m.score
      FROM matches m JOIN content_entries c ON m.entity_type='content' AND c.id=m.entity_id WHERE c.status='published'
      ORDER BY score DESC,title LIMIT 40
    `).bind(...bindings).all<{ type: SearchResult["type"]; slug:string; title:string; summary:string; href:string; image_path:string|null }>();
    return rows.results.map((row) => ({ type: row.type, slug: row.slug, title: row.title, summary: row.summary, href: row.href, imagePath: row.image_path }));
  } catch (error) {
    if (databaseWasBound()) throw error;
    return staticSearch(terms.join(" "));
  }
}

function tokenize(value: string): string[] { return [...new Set(value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/gu," ").replaceAll("-"," ").split(/\s+/u).filter((term)=>term.length>=2))]; }

function databaseWasBound(): boolean {
  try { getD1(); return true; } catch { return false; }
}

function staticSearch(term: string): SearchResult[] {
  const includes=(...values:string[])=>values.join(" ").toLowerCase().includes(term);
  return [
    ...destinationCatalog.filter((item)=>includes(item.name,item.country,item.region,item.summary)).map((item)=>({type:"destination" as const,slug:item.slug,title:item.name,summary:item.summary,href:`/destinations/${item.slug}`,imagePath:item.image})),
    ...packageCatalog.filter((item)=>includes(item.title,item.summary,item.description)).map((item)=>({type:"package" as const,slug:item.slug,title:item.title,summary:item.summary,href:`/packages/${item.slug}`,imagePath:item.image})),
    ...fallbackEntries.filter((item)=>includes(item.title,item.excerpt)).map((item)=>({type:item.type,slug:item.slug,title:item.title,summary:item.excerpt,href:item.type==="article"?`/resources/blog/${item.slug}`:`/resources/guides/${item.slug}`,imagePath:item.imagePath})),
  ].slice(0,40);
}
