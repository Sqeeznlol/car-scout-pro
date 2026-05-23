import { createServerFn } from "@tanstack/react-start";
import { getLiveEurChfRate } from "@/lib/fx.server";

export const getEurChfRate = createServerFn({ method: "GET" }).handler(async () => {
  const rate = await getLiveEurChfRate();
  return { rate, fetched_at: new Date().toISOString() };
});
