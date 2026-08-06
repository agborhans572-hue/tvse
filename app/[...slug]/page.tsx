import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Subpage } from "../components/Subpage";
import { pageList, pages } from "../page-data";

type RouteProps = {
  params: Promise<{ slug: string[] }>;
};

export function generateStaticParams() {
  return pageList.map((page) => ({ slug: page.path.slice(1).split("/") }));
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = pages[slug.join("/")];
  if (!page) return {};

  return {
    title: `${page.eyebrow} | TVSE Travel`,
    description: page.intro,
    openGraph: {
      title: `${page.eyebrow} | TVSE Travel`,
      description: page.intro,
      images: [{ url: "/og-motion.png", width: 1200, height: 630, alt: "TVSE Travel airplane journey" }],
    },
  };
}

export default async function HeaderPage({ params }: RouteProps) {
  const { slug } = await params;
  const page = pages[slug.join("/")];
  if (!page) notFound();

  return <Subpage page={page} />;
}
