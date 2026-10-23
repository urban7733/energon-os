const ORIGIN = "https://energon-os.urban33133.workers.dev";

export default {
  async fetch(request, env) {
    const publicUrl = new URL(request.url);
    const originUrl = new URL(`${publicUrl.pathname}${publicUrl.search}`, ORIGIN);
    const headers = new Headers(request.headers);

    headers.set("x-forwarded-host", publicUrl.host);
    headers.set("x-forwarded-proto", publicUrl.protocol.slice(0, -1));

    // The visitor IP is not guaranteed to survive this second hop, so pass it
    // explicitly. The origin only trusts it together with the shared secret
    // (see apps/web/lib/client-ip.ts); never forward a client-supplied value.
    headers.delete("x-energon-client-ip");
    headers.delete("x-energon-proxy-secret");
    const visitorIp = request.headers.get("cf-connecting-ip");
    if (visitorIp && env?.ENERGON_PROXY_SECRET) {
      headers.set("x-energon-client-ip", visitorIp);
      headers.set("x-energon-proxy-secret", env.ENERGON_PROXY_SECRET);
    }

    const originResponse = await fetch(
      new Request(originUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      }),
    );
    const response = new Response(originResponse.body, originResponse);
    const location = response.headers.get("location");

    if (location) {
      response.headers.set("location", location.replace(ORIGIN, publicUrl.origin));
    }

    return response;
  },
};
