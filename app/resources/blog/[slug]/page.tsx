import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResourceArticle } from "../../../components/ResourceViews";
import { getPublishedEntry } from "../../../../lib/public-content";

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const entry=await getPublishedEntry("article",(await params).slug);return entry?{title:entry.seoTitle||`${entry.title} | TVSE`,description:entry.seoDescription||entry.excerpt,alternates:{canonical:`/resources/blog/${entry.slug}`}}:{};}
export default async function ArticlePage({params}:{params:Promise<{slug:string}>}){const entry=await getPublishedEntry("article",(await params).slug);if(!entry)notFound();return <ResourceArticle entry={entry}/>;}
