import { cn } from "@/lib/utils";
import { scoreColor } from "@/lib/format";

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const c = scoreColor(score);
  const sizes = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border font-semibold tabular-nums", c.bg, sizes[size])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {score}
      <span className="opacity-70 font-normal text-[0.85em]">· {c.label}</span>
    </span>
  );
}
