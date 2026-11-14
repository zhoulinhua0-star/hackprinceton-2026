import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Syllabus Crew", description: "A personal agent for your semester, in iMessage." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
