import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Providers } from "@/app/providers";
import "@/app/globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "LETW Collaboration",
  description: "A private collaboration and document workspace for LETW.",
  icons: {
    icon: "/letw-logo.png",
    apple: "/letw-logo.png"
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LETW",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#1F6F5B"
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();

  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
