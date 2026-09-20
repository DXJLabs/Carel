import {
  BASE_URL,
  SEPOLIA_BASE_URL,
} from "@avnu/avnu-sdk";

import {
  RpcProvider,
} from "starknet";

import {
  STARKNET_MAINNET,
  STARKNET_SEPOLIA,
  getStarknetChain,
} from "@/lib/carel/ecosystems/starknet/chains";

import {
  ENDUR_XSTRK_ADDRESS,
  STARKNET_MAINNET_STRK,
  STARKNET_MAINNET_XSTRK,
  STARKNET_MAINNET_USDC,
  STARKNET_MAINNET_ETH,
  STARKNET_MAINNET_USDT,
  STARKNET_MAINNET_WBTC,
  STARKNET_MAINNET_STRKBTC,
  STARKNET_MAINNET_USDC_ADDRESS,
  STARKNET_SEPOLIA_STRK,
  STARKNET_SEPOLIA_USDC,
  STARKNET_SEPOLIA_USDC_ADDRESS,
  STRK_TOKEN_ADDRESS,
} from "@/lib/carel/ecosystems/starknet/assets";

const SEPOLIA_RPC =
  process.env
    .NEXT_PUBLIC_STARKNET_SEPOLIA_RPC ??
  "https://starknet-sepolia-rpc.publicnode.com";

const MAINNET_RPC =
  process.env
    .NEXT_PUBLIC_STARKNET_MAINNET_RPC ??
  "https://starknet-rpc.publicnode.com";

const sepoliaProvider =
  new RpcProvider({
    nodeUrl: SEPOLIA_RPC,
  });

const mainnetProvider =
  new RpcProvider({
    nodeUrl: MAINNET_RPC,
  });

/**
 * Legacy exports remain available while existing Starknet components migrate
 * to the generic CAREL asset registry.
 */
export const STRK_TOKEN =
  STRK_TOKEN_ADDRESS;

export const ENDUR_XSTRK_TOKEN =
  ENDUR_XSTRK_ADDRESS;

export const ENDUR_DEPOSIT_ANONYMIZER =
  "0x030dee638065962eb3642ca54aa48e9e2cd98536bc90b64b99bb306c1db30698";

export const ENDUR_PRIVACY_POOL =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

export const ENDUR_AVNU_FEE_RECIPIENT =
  "0x0066c76374a9adb11d4d283ac400331ec6a691c61029168bd70cea5d97dfc971";

export const CAREL_NETWORKS = {
  sepolia: {
    id: "sepolia",
    chain: STARKNET_SEPOLIA,
    chainId:
      STARKNET_SEPOLIA.chainId,
    label:
      STARKNET_SEPOLIA.name,
    tag: "Testnet",
    rpcUrl: SEPOLIA_RPC,
    provider: sepoliaProvider,
    avnuBaseUrl:
      SEPOLIA_BASE_URL,
    avnuExchange:
      "0x02c56e8b00dbe2a71e57472685378fc8988bba947e9a99b26a00fade2b4fe7c2",
    explorerTx:
      "https://sepolia.voyager.online/tx/",
    usdcToken:
      STARKNET_SEPOLIA_USDC_ADDRESS,
    assets: {
      strk:
        STARKNET_SEPOLIA_STRK,
      usdc:
        STARKNET_SEPOLIA_USDC,
      xstrk: null,
    },
    assetList: [
      STARKNET_SEPOLIA_STRK,
      STARKNET_SEPOLIA_USDC,
    ],
    gardenEnabled: true,
    privacyEnabled: true,
  },

  mainnet: {
    id: "mainnet",
    chain: STARKNET_MAINNET,
    chainId:
      STARKNET_MAINNET.chainId,
    label:
      STARKNET_MAINNET.name,
    tag: "Mainnet",
    rpcUrl: MAINNET_RPC,
    provider: mainnetProvider,
    avnuBaseUrl:
      BASE_URL,
    avnuExchange:
      "0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f",
    explorerTx:
      "https://voyager.online/tx/",
    usdcToken:
      STARKNET_MAINNET_USDC_ADDRESS,
    assets: {
      strk:
        STARKNET_MAINNET_STRK,
      usdc:
        STARKNET_MAINNET_USDC,
      eth:
        STARKNET_MAINNET_ETH,
      usdt:
        STARKNET_MAINNET_USDT,
      wbtc:
        STARKNET_MAINNET_WBTC,
      strkbtc:
        STARKNET_MAINNET_STRKBTC,
      xstrk:
        STARKNET_MAINNET_XSTRK,
    },
    assetList: [
      STARKNET_MAINNET_STRK,
      STARKNET_MAINNET_USDC,
      STARKNET_MAINNET_ETH,
      STARKNET_MAINNET_USDT,
      STARKNET_MAINNET_WBTC,
      STARKNET_MAINNET_STRKBTC,
      STARKNET_MAINNET_XSTRK,
    ],
    gardenEnabled: false,
    privacyEnabled: true,
  },
} as const;

/**
 * Compatibility resolver for the current Starknet-first UI.
 * The generic ChainRef is resolved first, then mapped to legacy network config.
 */
export function getCarelNetwork(
  chainId: string,
) {
  const chain =
    getStarknetChain(
      chainId,
    );

  if (!chain) {
    return null;
  }

  return chain.id ===
    STARKNET_SEPOLIA.id
    ? CAREL_NETWORKS.sepolia
    : CAREL_NETWORKS.mainnet;
}
