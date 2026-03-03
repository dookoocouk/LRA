import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "StratOS Lite — AI Decision Auditor | London Royal Academy",
  description:
    "One question. One click. Instant decision clarity. Audit your business decisions with AI-powered strategic analysis.",
  openGraph: {
    title: "StratOS Lite — AI Decision Auditor",
    description: "One question. One click. Instant decision clarity.",
    siteName: "London Royal Academy",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
