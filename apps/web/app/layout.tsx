import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./refined.css";
import "./styles/tokens.css";
import "./styles/landing.css";
import "./styles/dashboard.css";
import "./styles/atlas.css";
import { absoluteUrl, indexedClaims, site } from "../lib/site";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const siteVerification = {
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : {}),
  ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? { other: { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } }
    : {}),
};

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
      "application/json": [
        { url: "/.well-known/energon-agent.json", title: "Autonomous agent contract" },
      ],
    },
  },
  verification: siteVerification,
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
    shortcut: "/energonos.png",
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
    "ai-readable-index": absoluteUrl("/llms-full.txt"),
    "agent-discovery": absoluteUrl("/.well-known/energon-agent.json"),
    "source-code": site.repositoryUrl,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#050607",
};

/**
 * JSON-LD is inlined into a <script> element, where a literal `</script>` in
 * any string would end the element and turn the rest into live HTML.
 * Escaping `<`, `>` and `&` keeps every value inert JSON.
 */
function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Set per request by middleware.ts; reading it renders every page dynamically,
  // which a per-response CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site.url}/#organization`,
    name: "Energon OS",
    url: site.url,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/energonos.png"),
      width: 1536,
      height: 1024,
    },
    sameAs: [site.repositoryUrl],
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
    installUrl: site.repositoryUrl,
    softwareVersion: "0.1.0",
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    description: site.description,
    creator: { "@id": `${site.url}/#organization` },
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: site.repositoryUrl,
    },
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

  const apiJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    "@id": `${site.url}/#api`,
    name: "Energon OS API",
    url: site.url,
    description:
      "An API for permissioned memory writes, context builds, audit records, agent skills, and operational overview data.",
    provider: { "@id": `${site.url}/#organization` },
    documentation: site.apiDocumentationUrl,
    termsOfService: site.repositoryUrl,
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
    <html lang="en" data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: jsonLd(softwareJsonLd) }}
        />
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: jsonLd(apiJsonLd) }}
        />
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: jsonLd(roadmapJsonLd) }}
        />
        {children}
        <script
          type="module"
          nonce={nonce}
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token":"3acf164ed08040eaa29d0ad92e54cd22"}'
        />
      </body>
    </html>
  );
}
