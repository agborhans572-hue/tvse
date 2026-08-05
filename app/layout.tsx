import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tvse-travel.agborhans572.chatgpt.site"),
  title: "TVSE Travel | Remarkable journeys, made personal",
  description:
    "Tailor-made holidays, safaris, business travel and seamless support from Nairobi to the world.",
  openGraph: {
    title: "TVSE Travel | Remarkable journeys, made personal",
    description:
      "Handpicked stays, seamless support and journeys designed around you.",
    type: "website",
    images: [{ url: "/og-motion.png", width: 1200, height: 630, alt: "TVSE Travel airplane journey" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TVSE Travel | Remarkable journeys, made personal",
    description: "Handpicked stays, seamless support and journeys designed around you.",
    images: ["/og-motion.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
