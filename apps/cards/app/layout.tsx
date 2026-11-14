import type { Metadata, Viewport } from "next";
import "./cards.css";

// Absolute URLs for the preview image: the production domain on Vercel, localhost in dev.
const site = process.env.CARDS_PUBLIC_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3100");
export const metadata: Metadata = { metadataBase: new URL(site), title: "Syllabus Crew", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fffcf5" };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,500&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
