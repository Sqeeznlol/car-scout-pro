import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Decision, AdminConfig } from "./types";
import { defaultConfig } from "./seed";

interface DecisionRecord {
  vehicleId: string;
  decision: Decision;
  decidedAt: string;
  notes?: string;
}

interface RadarState {
  decisions: Record<string, DecisionRecord>;
  config: AdminConfig;
  lastVisited: string;
  decide: (vehicleId: string, decision: Decision, notes?: string) => void;
  undo: (vehicleId: string) => void;
  setConfig: (config: AdminConfig) => void;
  markVisited: () => void;
}

export const useRadarStore = create<RadarState>()(
  persist(
    (set) => ({
      decisions: {},
      config: defaultConfig,
      lastVisited: new Date().toISOString(),
      decide: (vehicleId, decision, notes) =>
        set((s) => ({
          decisions: {
            ...s.decisions,
            [vehicleId]: {
              vehicleId,
              decision,
              decidedAt: new Date().toISOString(),
              notes,
            },
          },
        })),
      undo: (vehicleId) =>
        set((s) => {
          const next = { ...s.decisions };
          delete next[vehicleId];
          return { decisions: next };
        }),
      setConfig: (config) => set({ config }),
      markVisited: () => set({ lastVisited: new Date().toISOString() }),
    }),
    { name: "mobile-radar-store" },
  ),
);
