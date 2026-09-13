import { RpcProvider } from "starknet";

export const STRK_TOKEN =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const STRK_DECIMALS = 18;

export const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC ??
  "https://starknet-sepolia.public.blastapi.io";

export const sepoliaProvider = new RpcProvider({
  nodeUrl: SEPOLIA_RPC,
});

export const SEPOLIA_EXPLORER_TX = "https://sepolia.voyager.online/tx/";
