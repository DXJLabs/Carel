"use client";

import type {
  BorrowMode,
} from "./model";

import {
  BorrowView,
} from "./BorrowView";

import {
  useBorrowController,
} from "./useBorrowController";


/**
 * Public Vesu Borrow feature boundary.
 *
 * State and execution live in useBorrowController.
 * Rendering lives in BorrowView.
 */
export function VesuBorrow({
  mode,
  goal,
  onPublicMode,
}: Readonly<{
  mode: BorrowMode;
  goal: string;
  onPublicMode: () => void;
}>) {
  const controller =
    useBorrowController({
      mode,
      goal,
    });

  return (
    <BorrowView
      mode={mode}
      controller={
        controller
      }
      onPublicMode={
        onPublicMode
      }
    />
  );
}
