import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import {
  BITCOIN_TESTNET4,
} from "./chains";

export const BITCOIN_TESTNET4_BTC:
  AssetRef = {
    id:
      "bitcoin:testnet4:BTC",

    chain:
      BITCOIN_TESTNET4,

    symbol:
      "BTC",

    name:
      "Bitcoin",

    decimals:
      8,

    identifier: {
      kind:
        "native",
    },
  };
