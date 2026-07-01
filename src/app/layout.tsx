import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Onto — see one place on another",
  description:
    "Lay a place you know over a place you don't, at true size, and feel how they compare.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${urbanist.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
