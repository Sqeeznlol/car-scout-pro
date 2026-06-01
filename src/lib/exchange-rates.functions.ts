import { createServerFn } from "@tanstack/react-start";
import { getEurChfRate } from "@/lib/exchange-rates.server";

export const fetchCurrentEurRate = createServerFn({ method: "GET" }).handler(async () => {
  return await getEurChfRate();
});
