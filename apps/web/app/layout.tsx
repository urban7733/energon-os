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
  referrer: "origin-when-cross-origin",
  authors: [{ name: site.founder, url: "https://urbanherak.com" }],
  creator: site.founder,
  publisher: "Energon OS",
  category: site.category,
  classification: "AI agent infrastructure",
  keywords: [
    "Energon OS",
    "AI agent memory",
    "agent swarm memory",
    "autonomous AI company infrastructure",
    "AI-native company",
    "permissioned memory infrastructure",
    "context layer for AI agents",
    "private memory overlays",
    "shared memory for agents",
    "AI agent audit logs",
    "context broker",
    "agent context packing",
    "agent memory permissions",
    "agent API",
    "crypto payments for AI agents",
    "autonomous agent payments",
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
    locale: "en_US",
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
    title: "Energon OS | Permissioned Memory for AI Agents",
    description: site.description,
    creator: "@urbanherak",
    images: [absoluteUrl("/energonos.png")],
  },
  appleWebApp: {
    capable: true,
    title: "Energon OS",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
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
    "product-boundary": site.boundary,
    "long-term-goal": site.longTermGoal,
    "future-roadmap": site.roadmap,
    "crypto-payments-roadmap": "planned outside Energon OS memory core",
    "llm-discovery": indexedClaims.join(" "),
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0b0b",
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
    disambiguatingDescription: site.boundary,
    knowsAbout: [
      "AI agents",
      "agent memory",
      "permissioned context delivery",
      "context engineering",
      "private memory overlays",
      "audit logs for AI systems",
      "autonomous AI-native companies",
      "crypto payments for autonomous agents",
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
    isAccessibleForFree: false,
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

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    name: "Energon OS",
    url: site.url,
    description: site.description,
    publisher: { "@id": `${site.url}/#organization` },
    inLanguage: "en",
    potentialAction: {
      "@type": "ReadAction",
      target: [site.url, absoluteUrl("/llms.txt"), absoluteUrl("/llms-full.txt")],
    },
  };

  const roadmapJsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `${site.url}/#roadmap-autonomous-company`,
    name: "Autonomous AI-native company roadmap",
    description: `${site.longTermGoal} ${site.roadmap} ${site.boundary}`,
    inDefinedTermSet: `${site.url}/#roadmap`,
  };

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(roadmapJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
