import { site } from "../../../lib/site";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      schema_version: "1.0",
      service: site.name,
      description: site.description,
      audiences: ["human_operator", "autonomous_agent"],
      api_base_url: site.apiBaseUrl,
      discovery_endpoint: `${site.apiBaseUrl}/v1/agents/discovery`,
      registration: {
        method: "POST",
        endpoint: `${site.apiBaseUrl}/v1/agents/register`,
        payment: "x402_when_enabled",
        body: { name: "optional agent display name" },
      },
      authentication: {
        scheme: "Bearer",
        credential: "api_key",
        verify_at: `${site.apiBaseUrl}/v1/swarm/runtime`,
      },
      sdk: {
        typescript: "@energon/sdk",
        python: "energon-sdk",
        rust: "energon-sdk",
      },
      documentation: `${site.url}/llms-full.txt`,
    },
    {
      headers: {
        "cache-control": "public, max-age=3600",
        "access-control-allow-origin": "*",
      },
    },
  );
}
