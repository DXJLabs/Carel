export type BridgeDirection = "to-starknet" | "to-bitcoin";
export type BridgeIntent = { direction: BridgeDirection; amount: string; symbol: "BTC" | "WBTC" | "strkBTC" };
export type BridgeState = "awaiting-deposit" | "confirming" | "exchanging" | "settling" | "completed" | "expired" | "refunding" | "refunded";
export type GardenAsset = {
  id: string;
  chain: "bitcoin_testnet" | "starknet_sepolia";
  symbol: "BTC" | "WBTC" | "strkBTC";
  decimals: 8;
  tokenAddress: string | null;
  htlcAddress: string | null;
  min: string | null;
  max: string | null;
};
export type GardenCatalog = { bitcoin: GardenAsset; starknet: GardenAsset[] };
export type BridgeQuote = {
  source: GardenAsset;
  destination: GardenAsset;
  sourceAmount: string;
  destinationAmount: string;
  estimatedSeconds: number | null;
  expiresAt: number;
};
export type BridgeRequest = { direction: BridgeDirection; assetId: string; amount: string };
export type CreateBridgeRequest = BridgeRequest & {
  starknetAddress: string;
  bitcoinAddress: string;
  expectedReceive: string;
  nonce: string;
};
export type BridgeCall = { contractAddress: string; entrypoint: "approve" | "initiate"; calldata: string[] };
export type BridgeOrder = {
  id: string;
  direction: BridgeDirection;
  asset: GardenAsset;
  state: BridgeState;
  createdAt: string;
  sourceAmount: string;
  destinationAmount: string;
  depositAddress: string | null;
  recipientAddress: string;
  sourceTx: string | null;
  destinationTx: string | null;
  refundTx: string | null;
  confirmations: number;
  requiredConfirmations: number;
  refundAfterBlocks: number;
};
export type SavedBridge = {
  id: string;
  owner: string;
  createdAt: number;
  fundingTx?: string;
  fundingAttempted?: boolean;
};
