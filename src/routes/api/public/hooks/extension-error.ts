import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/hooks/extension-error")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            url?: string;
            mobile_de_id?: string;
            error_message?: string;
            context?: unknown;
          };
          if (!body.error_message) {
            return new Response(JSON.stringify({ ok: false, error: "error_message required" }), {
              status: 400,
              headers: { "content-type": "application/json", ...CORS },
            });
          }
          await supabaseAdmin.from("sync_errors").insert({
            source: "extension",
            url: body.url ?? null,
            mobile_de_id: body.mobile_de_id ?? null,
            error_message: String(body.error_message).slice(0, 2000),
            context: (body.context ?? null) as never,
          });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json", ...CORS },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});
