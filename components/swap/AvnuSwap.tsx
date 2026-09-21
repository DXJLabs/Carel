"use client";

import type {
  AvnuSwapMode,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/swap";

import {
  SwapView,
} from "./SwapView";

import {
  useSwapController,
} from "./useSwapController";


export function AvnuSwap({
  mode,
  goal,
}: Readonly<{
  mode:
    AvnuSwapMode;

  goal:
    string;
}>) {
  const controller =
    useSwapController({
      mode,
      goal,
    });

  return (
    <SwapView
      mode={mode}
      controller={
        controller
      }
    />
  );
}
