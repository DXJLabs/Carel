import {
  BASE_URL,
  SEPOLIA_BASE_URL,
} from "@avnu/avnu-sdk";
import {
  constants,
  RpcProvider,
} from "starknet";

const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC ??
  "https://starknet-sepolia.public.blastapi.io";

const MAINNET_RPC =
  process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC ??
  "https://starknet-mainnet.public.blastapi.io";

const sepoliaProvider = new RpcProvider({
  nodeUrl: SEPOLIA_RPC,
});

const mainnetProvider = new RpcProvider({
  nodeUrl: MAINNET_RPC,
});

export const STRK_TOKEN =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const CAREL_NETWORKS = {
  sepolia: {
    id: "sepolia",
    chainId: constants.StarknetChainId.SN_SEPOLIA,
    label: "Starknet Sepolia",
    tag: "Testnet",
    rpcUrl: SEPOLIA_RPC,
    provider: sepoliaProvider,
    avnuBaseUrl: SEPOLIA_BASE_URL,
    avnuExchange:
      "0x02c56e8b00dbe2a71e57472685378fc8988bba947e9a99b26a00fade2b4fe7c2",
    explorerTx: "https://sepolia.voyager.online/tx/",
    usdcToken:
      "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343",
    gardenEnabled: true,
    privacyEnabled: true,
  },

  mainnet: {
    id: "mainnet",
    chainId: constants.StarknetChainId.SN_MAIN,
    label: "Starknet Mainnet",
    tag: "Mainnet",
    rpcUrl: MAINNET_RPC,
    provider: mainnetProvider,
    avnuBaseUrl: BASE_URL,
    avnuExchange:
      "0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f",
    explorerTx: "https://voyager.online/tx/",
    usdcToken:
      "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
    gardenEnabled: false,
    privacyEnabled: true,
  },
} as const;

export function getCarelNetwork(chainId: string) {
  if (
    chainId ===
    constants.StarknetChainId.SN_SEPOLIA
  ) {
    return CAREL_NETWORKS.sepolia;
  }

  if (
    chainId ===
    constants.StarknetChainId.SN_MAIN
  ) {
    return CAREL_NETWORKS.mainnet;
  }

  return null;
}
