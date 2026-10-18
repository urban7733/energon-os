const ORIGIN = "https://energon-os.urban33133.workers.dev";

export default {
  async fetch(request) {
    const publicUrl = new URL(request.url);
    const originUrl = new URL(`${publicUrl.pathname}${publicUrl.search}`, ORIGIN);
    const headers = new Headers(request.headers);

    headers.set("x-forwarded-host", publicUrl.host);
    headers.set("x-forwarded-proto", publicUrl.protocol.slice(0, -1));

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
