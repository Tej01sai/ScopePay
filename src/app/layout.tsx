import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScopePay",
  description: "Scope review and change proposals — sandbox demo",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
