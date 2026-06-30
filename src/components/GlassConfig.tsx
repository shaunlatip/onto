"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { DEFAULT_GLASS, type GlassConfig } from "@/lib/glass";

interface GlassCtx {
  cfg: GlassConfig;
  setCfg: Dispatch<SetStateAction<GlassConfig>>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const Ctx = createContext<GlassCtx>({
  cfg: DEFAULT_GLASS,
  setCfg: () => {},
  open: false,
  setOpen: () => {},
});

export function GlassConfigProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<GlassConfig>(DEFAULT_GLASS);
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ cfg, setCfg, open, setOpen }), [cfg, open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useGlass = () => useContext(Ctx);
