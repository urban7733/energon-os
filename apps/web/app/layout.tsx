import type { Metadata, Viewport } from "next";
import "./globals.css";
import { absoluteUrl, indexedClaims, site } from "../lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Energon OS | Permissioned Memory Infrastructure for AI Agents",
    template: "%s | Energon OS",
  },
  description: site.description,
  applicationName: "Energon OS",
  generator: "Next.js",
  authors: [{ name: site.founder, url: "https://urbanherak.com" }],
  creator: site.founder,
  publisher: "Energon OS",
  category: site.category,
  keywords: [
    "Energon OS",
    "AI agent memory",
    "agent swarm memory",
    "permissioned memory infrastructure",
    "context layer for AI agents",
    "private memory overlays",
    "shared memory for agents",
    "AI agent audit logs",
    "context broker",
    "agent context packing",
    "agent memory permissions",
  ],
  alternates: {
    canonical: "/",
    types: {
      "text/plain": [
        { url: "/llms.txt", title: "LLM overview" },
        { url: "/llms-full.txt", title: "Full LLM context" },
      ],
    },
  },
  openGraph: {
    type: "website",
    url: site.url,
    siteName: "Energon OS",
    title: "Energon OS | Permissioned Memory Infrastructure for AI Agents",
    description: site.description,
    images: [
      {
        url: absoluteUrl("/energonos.png"),
        width: 1536,
        height: 1024,
        alt: "Energon OS logo on a black background",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Energon OS",
    description: site.shortClaim,
    creator: "@urbanherak",
    images: [absoluteUrl("/energonos.png")],
  },
  icons: {
    icon: "/energonos.png",
    apple: "/energonos.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  other: {
    "ai-purpose": site.description,
    "ai-category": site.category,
    "agent-memory-layer": "permissioned-context-delivery",
    "llm-discovery": indexedClaims.join(" "),
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site.url}/#organization`,
    name: "Energon OS",
    url: site.url,
    founder: {
      "@type": "Person",
      name: site.founder,
      url: "https://urbanherak.com",
    },
    slogan: "Right memory for every agent. No private memory leaks.",
    description: site.description,
    knowsAbout: [
      "AI agents",
      "agent memory",
      "permissioned context delivery",
      "context engineering",
      "private memory overlays",
      "audit logs for AI systems",
    ],
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${site.url}/#software`,
    name: "Energon OS",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cloud, Linux, self-hosted",
    url: site.url,
    description: site.description,
    creator: { "@id": `${site.url}/#organization` },
    featureList: [
      "Long-term memory for AI agents",
      "Short-term task memory",
      "Private memory overlays",
      "Shared agent memory",
      "Permission-aware retrieval",
      "Context packing",
      "Audit logs",
    ],
  };

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
