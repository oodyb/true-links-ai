// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// initialization of the primary sans-serif font using geist
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// initialization of the monospace font for technical or tabular data
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// global site metadata for search engine optimization and browser identification
export const metadata: Metadata = {
  title: "TrueLinks AI",
  description: "Legal intelligence for the FIDIC framework. ",
};

// base structural component that wraps every page within the application
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* application of layout constraints to ensure the body occupies the full viewport height */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}