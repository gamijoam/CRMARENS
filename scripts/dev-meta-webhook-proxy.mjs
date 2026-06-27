import http from "node:http";

const targetOrigin = process.env.META_WEBHOOK_TARGET_ORIGIN ?? "http://localhost:3001";
const port = Number(process.env.META_WEBHOOK_PROXY_PORT ?? 3010);
const allowedPrefixes = [
  "/api/webhooks/meta/facebook",
  "/api/webhooks/meta/instagram",
  "/api/webhooks/meta/whatsapp"
];

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const isAllowed = allowedPrefixes.some((prefix) => requestUrl.pathname === prefix);

  if (!isAllowed) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, targetOrigin);
  const proxyRequest = http.request(
    target,
    {
      headers: {
        ...request.headers,
        host: target.host
      },
      method: request.method
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    }
  );

  proxyRequest.on("error", (error) => {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  });

  request.pipe(proxyRequest);
});

server.listen(port, () => {
  console.log(`Meta webhook proxy listening on http://localhost:${port}`);
  console.log(`Forwarding allowed webhook routes to ${targetOrigin}`);
});
