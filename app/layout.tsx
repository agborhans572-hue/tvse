import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TVSE Travel | Journeys worth remembering",
  description:
    "Thoughtfully designed holidays, safaris, city breaks and beach escapes from Nairobi to the world.",
  openGraph: {
    title: "TVSE Travel | Go somewhere unforgettable",
    description:
      "Handpicked stays, seamless support and journeys designed around you.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
