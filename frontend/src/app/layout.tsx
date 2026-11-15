// src/app/layout.tsx

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "@/components/Toaster";
import { MapsProvider } from "@/contexts/MapsContext";
import { AccountProvider } from "@/contexts/AccountContext";
import { AccountSafety } from "@/components/safety/SafetyProvider";

const geist = localFont({ src: "./fonts/GeistVF.woff", display: "swap" });

export const viewport: Viewport = { themeColor: "#0d0e0c", viewportFit: "cover" };

export const metadata: Metadata = {
  title: "Jugnu",
  description: "Your AI-powered safety companion",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
      {
        url: "/web-app-manifest-192x192.png",
        type: "image/png",
        sizes: "192x192",
      },
      {
        url: "/web-app-manifest-512x512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <MapsProvider>
          <AccountProvider><AccountSafety>
            <Navbar />
            <main id="content" className="app-content">{children}</main>
            <Toaster />
          </AccountSafety></AccountProvider>
        </MapsProvider>
      </body>
    </html>
  );
}
