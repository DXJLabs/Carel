import {
  normalizeStarknetAddress,
  sameStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

export type VesuPoolRef =
  Readonly<{
    id: string;
    name: string;
    address: string;
  }>;

/**
 * Vesu V2 Mainnet pools CAREL is allowed to probe.
 *
 * Presence here never means a pair is executable. CAREL still verifies
 * asset registration, oracle state, pair config, debt cap and utilization
 * on-chain before preparing a Borrow transaction.
 */
export const VESU_V2_MAINNET_POOLS:
  readonly VesuPoolRef[] = [
    {
      id: "prime",
      name: "Prime",
      address:
        "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5",
    },
    {
      id: "re7-usdc-core",
      name: "Re7 USDC Core",
      address:
        "0x03976cac265a12609934089004df458ea29c776d77da423c96dc761d09d24124",
    },
    {
      id: "re7-usdc-prime",
      name: "Re7 USDC Prime",
      address:
        "0x02eef0c13b10b487ea5916b54c0a7f98ec43fb3048f60fdeedaf5b08f6f88aaf",
    },
    {
      id: "re7-usdc-frontier",
      name: "Re7 USDC Frontier",
      address:
        "0x05c03e7e0ccfe79c634782388eb1e6ed4e8e2a013ab0fcc055140805e46261bd",
    },
    {
      id: "re7-xbtc",
      name: "Re7 xBTC",
      address:
        "0x03a8416bf20d036df5b1cf3447630a2e1cb04685f6b0c3a70ed7fb1473548ecf",
    },
    {
      id: "re7-usdc-stable-core",
      name: "Re7 USDC Stable Core",
      address:
        "0x073702fce24aba36da1eac539bd4bae62d4d6a76747b7cdd3e016da754d7a135",
    },
  ];

/**
 * Resolves a pool only from CAREL's reviewed Vesu allowlist.
 */
export function getVesuPool(
  id: string,
): VesuPoolRef | null {
  return (
    VESU_V2_MAINNET_POOLS.find(
      (pool) =>
        pool.id === id,
    ) ?? null
  );
}

/**
 * Confirms an address belongs to CAREL's reviewed Vesu pool allowlist.
 */
export function isAllowedVesuPool(
  address: string,
): boolean {
  const normalized =
    normalizeStarknetAddress(
      address,
    );

  return VESU_V2_MAINNET_POOLS.some(
    (pool) =>
      sameStarknetAddress(
        pool.address,
        normalized,
      ),
  );
}
