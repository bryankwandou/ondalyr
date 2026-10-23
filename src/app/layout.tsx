import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Fonts ship with the build, so a deploy never depends on reaching Google Fonts.
const display = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-display",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ondalyr",
  description:
    "A light browser player for songs, music videos, live radio and podcasts. Lyrics re-time themselves to the clip, and the stage switches between cover, video and a live spectrum.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#14110f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
