import {
  formatUnits,
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  sameStarknetFelt,
} from "@/lib/carel/ecosystems/starknet/addresses";

const STRK_DECIMALS = 18;

/**
 * Compatibility wrapper for existing STRK20 code.
 * New multi-asset code should call core parseUnits with the asset decimals.
 */
export function parseUnits18(
  value: string,
): bigint {
  return parseUnits(
    value,
    STRK_DECIMALS,
  );
}

/**
 * Compatibility wrapper for existing STRK20 display code.
 */
export function formatUnits18(
  value: bigint,
  maxDecimals = 4,
): string {
  return formatUnits(
    value,
    STRK_DECIMALS,
    maxDecimals,
  );
}

/**
 * Preserves the old sameFelt API while moving comparison logic out of STRK20.
 */
export function sameFelt(
  left: unknown,
  right: unknown,
): boolean {
  return sameStarknetFelt(
    left,
    right,
  );
}
