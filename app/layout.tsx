import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tvse-travel.agborhans572.chatgpt.site"),
  alternates: { canonical: "/" },
  title: "TVSE Travel | Remarkable journeys, made personal",
  description:
    "Tailor-made holidays, safaris, business travel and seamless support from Nairobi to the world.",
  openGraph: {
    title: "TVSE Travel | Remarkable journeys, made personal",
    description:
      "Handpicked stays, seamless support and journeys designed around you.",
    type: "website",
    url: "/",
    siteName: "TVSE Travel Agency Ltd",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TVSE Travel Agency Ltd — remarkable journeys, made personal" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TVSE Travel | Remarkable journeys, made personal",
    description: "Handpicked stays, seamless support and journeys designed around you.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const travelAgency = {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: "TVSE Travel Agency Ltd",
    url: "https://tvse-travel.agborhans572.chatgpt.site",
    logo: "https://tvse-travel.agborhans572.chatgpt.site/tvse-travel-agency-ltd-logo-transparent.png",
    email: "hello@tvsetravel.com",
    address: { "@type": "PostalAddress", addressLocality: "Nairobi", addressCountry: "KE" },
    areaServed: ["Kenya", "Africa", "Worldwide"],
  };
  return (
    <html lang="en">
      <body className={geist.variable}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(travelAgency) }} />{children}</body>
    </html>
  );
}
