import {
  AVNU_SWAP_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/adapter";

import {
  AVNU_STAKING_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter";

import {
  ENDUR_SHIELD_STAKING_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/adapter";

import {
  VESU_BORROW_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/adapter";

import {
  GARDEN_BRIDGE_ADAPTER_ID,
} from "@/lib/carel/protocols/garden/adapter";

export type CarelRuntimeSurface =
  | "swap"
  | "bridge"
  | "staking"
  | "borrow";

/**
 * Maps a provider adapter selected by CAREL's registry to the runtime surface
 * that owns its reviewed quote/preparation/wallet execution flow.
 */
export function runtimeSurfaceForAdapter(
  adapterId: string | null | undefined,
): CarelRuntimeSurface | null {
  switch (adapterId) {
    case AVNU_SWAP_ADAPTER_ID:
      return "swap";

    case AVNU_STAKING_ADAPTER_ID:
    case ENDUR_SHIELD_STAKING_ADAPTER_ID:
      return "staking";

    case VESU_BORROW_ADAPTER_ID:
      return "borrow";

    case GARDEN_BRIDGE_ADAPTER_ID:
      return "bridge";

    default:
      return null;
  }
}

/**
 * Keeps direct tool-button navigation working when no adapter has been
 * selected yet, such as before wallet connection or Bridge asset selection.
 */
export function fallbackRuntimeSurface(
  tool:
    | "Swap"
    | "Bridge"
    | "Staking"
    | "Borrow"
    | null,
): CarelRuntimeSurface | null {
  switch (tool) {
    case "Swap":
      return "swap";

    case "Bridge":
      return "bridge";

    case "Staking":
      return "staking";

    case "Borrow":
      return "borrow";

    default:
      return null;
  }
}
