import type { MetadataRoute } from "next";
import { pages } from "./page-data";
import { getPublishedDestinations, getPublishedEntries, getPublishedPackages } from "../lib/public-content";

const baseUrl = "https://tvse-travel.agborhans572.chatgpt.site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [destinations, packages, entries] = await Promise.all([
    getPublishedDestinations(),
    getPublishedPackages(),
    getPublishedEntries(),
  ]);
  const fixed = ["", "destinations", "packages", "plan-a-trip", "corporate", "about", "faq", "support", "contact", "resources", "resources/blog", "resources/guides", ...Object.keys(pages).filter((path) => !path.startsWith("login/") && !path.startsWith("resources"))];
  const paths = new Set(fixed);
  destinations.forEach((item) => paths.add(`destinations/${item.slug}`));
  packages.forEach((item) => paths.add(`packages/${item.slug}`));
  entries.forEach((item) => paths.add(`${item.type === "article" ? "resources/blog" : "resources/guides"}/${item.slug}`));
  const now = new Date();
  return [...paths].map((path) => ({ url: `${baseUrl}/${path}`, lastModified: now, changeFrequency: path === "" ? "weekly" : "monthly", priority: path === "" ? 1 : path.startsWith("destinations") || path.startsWith("packages") ? 0.8 : 0.6 }));
}
