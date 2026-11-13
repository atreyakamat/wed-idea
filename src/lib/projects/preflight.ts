/** The answer to a browser's CORS check on the worker API. The allowed origin is set in next.config.ts. */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
