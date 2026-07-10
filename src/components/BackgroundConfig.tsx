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
import { DEFAULT_BACKGROUND_KEY } from "@/lib/background";

interface BackgroundCtx {
  bgKey: string;
  setBgKey: Dispatch<SetStateAction<string>>;
}

const Ctx = createContext<BackgroundCtx>({
  bgKey: DEFAULT_BACKGROUND_KEY,
  setBgKey: () => {},
});

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [bgKey, setBgKey] = useState(DEFAULT_BACKGROUND_KEY);
  const value = useMemo(() => ({ bgKey, setBgKey }), [bgKey]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBackground = () => useContext(Ctx);
