import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./carel-theme.css";

const bodyFont = localFont({
  src: "../public/fonts/manrope.woff2",
  variable: "--font-carel-body",
  weight: "400 800",
  display: "swap",
});
const displayFont = localFont({
  src: "../public/fonts/space-grotesk.woff2",
  variable: "--font-carel-display",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CAREL — Agentic Private DeFi",
  description: "A goal-driven, policy-controlled private DeFi agent on Starknet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "auto",
  themeColor: "#0d0d0d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}
