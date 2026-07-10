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
import { DEFAULT_MAP_STYLE_KEY } from "@/lib/map";

interface MapStyleCtx {
  styleKey: string;
  setStyleKey: Dispatch<SetStateAction<string>>;
}

const Ctx = createContext<MapStyleCtx>({
  styleKey: DEFAULT_MAP_STYLE_KEY,
  setStyleKey: () => {},
});

export function MapStyleProvider({ children }: { children: ReactNode }) {
  const [styleKey, setStyleKey] = useState(DEFAULT_MAP_STYLE_KEY);
  const value = useMemo(() => ({ styleKey, setStyleKey }), [styleKey]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMapStyle = () => useContext(Ctx);
