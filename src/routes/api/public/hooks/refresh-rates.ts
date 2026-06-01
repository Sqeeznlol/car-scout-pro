import { createFileRoute } from "@tanstack/react-router";
import { getEurChfRate } from "@/lib/exchange-rates.server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/hooks/refresh-rates")({
  server: {
    handlers: {
      GET: async () => {
        const result = await getEurChfRate();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { "content-type": "application/json", ...CORS },
        });
      },
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
