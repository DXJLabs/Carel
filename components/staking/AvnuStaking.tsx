"use client";

import {
  StakingView,
} from "./StakingView";

import {
  useStakingController,
  type StakingMode,
} from "./useStakingController";


export function AvnuStaking({
  mode,
  goal,
  onPublicMode,
}: Readonly<{
  mode:
    StakingMode;

  goal:
    string;

  onPublicMode:
    () => void;
}>) {
  const controller =
    useStakingController({
      mode,
      goal,
    });


  return (
    <StakingView
      mode={mode}
      onPublicMode={
        onPublicMode
      }
      controller={
        controller
      }
    />
  );
}
