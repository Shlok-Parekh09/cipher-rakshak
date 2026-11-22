import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CipherRakshak | Citizen privacy workspace",
  description: "Prepare, send and track a privacy request.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
