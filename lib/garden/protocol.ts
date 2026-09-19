import type { BridgeCall, BridgeDirection, BridgeIntent, BridgeOrder, GardenAsset, GardenCatalog } from "./types";

export const BITCOIN_ASSET = "bitcoin_testnet:btc";
export const STARKNET_CHAIN = "starknet_sepolia";

// Garden /assets currently identifies Starknet Sepolia with
// the Starknet chain ID encoded as a decimal value.
const GARDEN_STARKNET_SEPOLIA_CHAIN =
  "starknet:393402133025997798000961";

const MAX_SATS = 21_000_000n * 100_000_000n;
const FELT_LIMIT = (1n << 251n) + 17n * (1n << 192n) + 1n;

export class BridgeError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "INVALID_REQUEST") { super(message); }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BridgeError("Garden returned an invalid response.", 502, "INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.length || value.length > max) throw new BridgeError("A required field is invalid.");
  return value;
}
export function units(value: unknown, allowZero = false): bigint {
  const input = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : text(value, 24);
  if (!/^(0|[1-9]\d*)$/.test(input)) throw new BridgeError("Invalid Bitcoin amount.");
  const n = BigInt(input);
  if (n > MAX_SATS || (allowZero ? n < 0n : n <= 0n)) throw new BridgeError("Amount is outside the supported range.");
  return n;
}
export function parseBitcoinAmount(value: unknown): string {
  const input = text(value, 30).trim();
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,8})?$/.test(input)) throw new BridgeError("Enter an amount greater than zero, with at most 8 decimals.");
  const [whole, fraction = ""] = input.split(".");
  return units((BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"))).toString()).toString();
}
export function formatBitcoinAmount(value: string): string {
  const n = units(value, true);
  return `${n / 100_000_000n}.${(n % 100_000_000n).toString().padStart(8, "0")}`;
}
export function parseBridgeGoal(goal: string): BridgeIntent {
  const match = goal.trim().match(/^bridge\s+([0-9]+(?:\.[0-9]+)?)\s+(BTC|WBTC|strkBTC)\s+to\s+(Starknet Sepolia|Bitcoin Testnet4)\.?$/i);
  if (!match) throw new BridgeError("Use “Bridge 0.0005 BTC to Starknet Sepolia” or choose Bridge to fill in the route.");
  parseBitcoinAmount(match[1]);
  const incoming = match[3].toLowerCase() === "starknet sepolia";
  const symbol = match[2].toLowerCase() === "btc" ? "BTC" : match[2].toLowerCase() === "strkbtc" ? "strkBTC" : "WBTC";
  if ((incoming && symbol !== "BTC") || (!incoming && symbol === "BTC")) throw new BridgeError("Choose BTC → Starknet Sepolia, or a listed Starknet Bitcoin token → Bitcoin Testnet4.");
  return { direction: incoming ? "to-starknet" : "to-bitcoin", amount: match[1], symbol };
}
export function felt(value: unknown): string {
  const input = text(value, 80);
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(input)) throw new BridgeError("Invalid Starknet address.");
  const n = BigInt(input);
  if (n <= 0n || n >= FELT_LIMIT) throw new BridgeError("Invalid Starknet address.");
  return `0x${n.toString(16)}`;
}
export function orderId(value: unknown): string {
  const id = text(value, 64);
  if (!/^[0-9a-f]{64}$/i.test(id)) throw new BridgeError("Invalid Garden order ID.");
  return id.toLowerCase();
}
export function direction(value: unknown): BridgeDirection {
  if (value !== "to-bitcoin" && value !== "to-starknet") throw new BridgeError("Choose a bridge direction.");
  return value;
}

// SegWit v0 / Taproot v1 Testnet addresses, including Bech32/Bech32m checksum.
// tb1 addresses are shared with older test networks; the UI explicitly requires Testnet4.
export function bitcoinAddress(value: unknown): string {
  const address = text(value, 90);
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) throw new BridgeError("Bitcoin address has mixed letter case.");
  const lower = address.toLowerCase();
  if (!lower.startsWith("tb1")) throw new BridgeError("Use a Bitcoin Testnet4 tb1 address.");
  const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const data = [...lower.slice(3)].map(c => charset.indexOf(c));
  if (data.length < 7 || data.some(c => c < 0)) throw new BridgeError("Invalid Bitcoin address.");
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const v of [3, 3, 0, 20, 2, ...data]) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) checksum ^= generators[i];
  }
  const version = data[0];
  if ((version !== 0 && version !== 1) || (checksum >>> 0) !== (version === 0 ? 1 : 0x2bc830a3)) throw new BridgeError("Bitcoin address checksum is invalid.");
  let acc = 0, bits = 0;
  const program: number[] = [];
  for (const v of data.slice(1, -6)) {
    acc = ((acc << 5) | v) & 0xfff;
    bits += 5;
    while (bits >= 8) { bits -= 8; program.push((acc >>> bits) & 255); }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 255) !== 0 || (version === 0 ? ![20, 32].includes(program.length) : program.length !== 32)) throw new BridgeError("Invalid Bitcoin witness program.");
  return lower;
}

function optionalLimit(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return units(value, true).toString();
}

function matchesGardenChain(
  assetId: unknown,
  chain: unknown,
): boolean {
  if (assetId === BITCOIN_ASSET) {
    return (
      chain === "bitcoin" ||
      chain === "bitcoin_testnet"
    );
  }

  if (
    typeof assetId === "string" &&
    /^starknet_sepolia:(wbtc|strkbtc)$/i.test(assetId)
  ) {
    return (
      chain === GARDEN_STARKNET_SEPOLIA_CHAIN ||
      chain === "starknet" ||
      chain === STARKNET_CHAIN
    );
  }

  return false;
}
export function parseCatalog(value: unknown): GardenCatalog {
  if (!Array.isArray(value)) throw new BridgeError("Garden asset catalogue is unavailable.", 502);
  const supported: GardenAsset[] = [];
  for (const item of value) {
    const row = object(item);
    const id = typeof row.id === "string" ? row.id : "";
    if (id !== BITCOIN_ASSET && !/^starknet_sepolia:(wbtc|strkbtc)$/i.test(id)) continue;
    const chain =
      id === BITCOIN_ASSET
        ? "bitcoin_testnet"
        : STARKNET_CHAIN;

    if (
      !matchesGardenChain(id, row.chain) ||
      row.decimals !== 8
    ) {
      throw new BridgeError(
        "Garden asset network or precision changed. Route disabled.",
        502,
      );
    }
    let tokenAddress: string | null = null, htlcAddress: string | null = null;
    if (chain === STARKNET_CHAIN) {
      const token = object(row.token), htlc = object(row.htlc);
      if (token.schema !== "starknet:erc20" || !["starknet:htlc", "starknet:htlc_erc20"].includes(String(htlc.schema))) throw new BridgeError("Unsupported Garden contract schema.", 502);
      tokenAddress = felt(token.address); htlcAddress = felt(htlc.address);
    }
    if (supported.some(asset => asset.id === id)) throw new BridgeError("Garden returned duplicate assets.", 502);
    supported.push({ id, chain, symbol: chain === "bitcoin_testnet" ? "BTC" : id.split(":")[1].toLowerCase() === "strkbtc" ? "strkBTC" : "WBTC", decimals: 8, tokenAddress, htlcAddress, min: optionalLimit(row.min_amount), max: optionalLimit(row.max_amount) });
  }
  const bitcoin = supported.find(asset => asset.id === BITCOIN_ASSET);
  const starknet = supported.filter(asset => asset.chain === STARKNET_CHAIN).sort((a, b) => Number(b.symbol === "strkBTC") - Number(a.symbol === "strkBTC"));
  if (!bitcoin || !starknet.length) throw new BridgeError("Garden currently lists no supported Bitcoin–Starknet testnet assets.", 503, "NO_ROUTE");
  return { bitcoin, starknet };
}
export function routeAssets(catalog: GardenCatalog, requested: unknown, assetId: unknown) {
  const route = direction(requested);
  const asset = catalog.starknet.find(item => item.id === assetId);
  if (!asset) throw new BridgeError("That asset is not listed by Garden on Starknet Sepolia.", 400, "NO_ROUTE");
  return { direction: route, asset, source: route === "to-starknet" ? catalog.bitcoin : asset, destination: route === "to-starknet" ? asset : catalog.bitcoin };
}
export function checkLimits(asset: GardenAsset, value: string) {
  const amount = units(value);
  if (asset.min !== null && amount < BigInt(asset.min)) throw new BridgeError(`Minimum is ${formatBitcoinAmount(asset.min)} ${asset.symbol}.`);
  if (asset.max !== null && BigInt(asset.max) > 0n && amount > BigInt(asset.max)) throw new BridgeError(`Maximum is ${formatBitcoinAmount(asset.max)} ${asset.symbol}.`);
}
export function validateFundingCalls(calls: BridgeCall[]): BridgeCall[] {
  if (!Array.isArray(calls) || calls.length !== 2) throw new BridgeError("Invalid Garden funding transaction.");
  const [approval, initiate] = calls;
  if (approval.entrypoint !== "approve" || initiate.entrypoint !== "initiate" || approval.calldata.length !== 3 || initiate.calldata.length !== 12) throw new BridgeError("Unsupported Garden funding transaction.");
  const token = felt(approval.contractAddress), htlc = felt(initiate.contractAddress);
  if (felt(approval.calldata[0]) !== htlc || token === htlc) throw new BridgeError("Garden approval target mismatch.");
  const word = (value: string) => {
    if (typeof value !== "string" || !/^(0x[0-9a-f]+|[0-9]+)$/i.test(value)) throw new BridgeError("Invalid Garden transaction data.");
    return BigInt(value);
  };
  const value = word(approval.calldata[1]);
  units(value.toString());
  if (word(approval.calldata[2]) !== 0n || word(initiate.calldata[2]) !== value || word(initiate.calldata[3]) !== 0n) throw new BridgeError("Garden approval must match the exact bridge amount.");
  felt(initiate.calldata[0]);
  const timelock = word(initiate.calldata[1]);
  if (timelock <= 0n || timelock > 100_000n || initiate.calldata.slice(4).some(v => word(v) > 0xffffffffn)) throw new BridgeError("Invalid Garden hashlock or refund timelock.");
  return [ { ...approval, contractAddress: token, calldata: [...approval.calldata] }, { ...initiate, contractAddress: htlc, calldata: [...initiate.calldata] } ];
}
function integer(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}
function transaction(value: unknown): string | null {
  return typeof value === "string" && /^(?:0x)?[0-9a-f]{1,64}(?::\d+)?$/i.test(value) ? value : null;
}
export function parseOrder(value: unknown, catalog: GardenCatalog, expectedId: string, owner: string, now = Date.now()): BridgeOrder {
  const row = object(value), source = object(row.source_swap), destination = object(row.destination_swap);
  if (orderId(row.order_id) !== orderId(expectedId)) throw new BridgeError("Garden order ID mismatch.", 502);
  const toStarknet = source.asset === BITCOIN_ASSET;
  const route = routeAssets(catalog, toStarknet ? "to-starknet" : "to-bitcoin", toStarknet ? destination.asset : source.asset);
  if (
    source.asset !== route.source.id ||
    destination.asset !== route.destination.id ||
    !matchesGardenChain(source.asset, source.chain) ||
    !matchesGardenChain(destination.asset, destination.chain)
  ) {
    throw new BridgeError(
      "Garden order is not on the requested testnets.",
      502,
    );
  }
  if (felt(toStarknet ? destination.redeemer : source.initiator) !== felt(owner)) throw new BridgeError("This order belongs to a different Starknet account.", 403);
  const createdAt = text(row.created_at, 64);
  if (!Number.isFinite(Date.parse(createdAt))) throw new BridgeError("Invalid Garden order timestamp.", 502);
  const sourceTx = transaction(source.initiate_tx_hash);
  const destinationTx = transaction(destination.redeem_tx_hash);
  const refundTx = transaction(source.refund_tx_hash);
  const confirmations = integer(source.current_confirmations), requiredConfirmations = integer(source.required_confirmations);
  let state: BridgeOrder["state"] = "awaiting-deposit";
  if (refundTx) state = integer(source.refund_block_number) > 0 ? "refunded" : "refunding";
  else if (destinationTx) state = integer(destination.redeem_block_number) > 0 ? "completed" : "settling";
  else if (transaction(destination.initiate_tx_hash)) state = "settling";
  else if (sourceTx || units(source.filled_amount ?? "0", true) > 0n) state = confirmations < requiredConfirmations ? "confirming" : "exchanging";
  else if (now - Date.parse(createdAt) >= 3_600_000) state = "expired";
  if (!refundTx && !destinationTx && (row.status === "Expired" || row.status === "DeadLineExceeded")) state = "expired";
  return { id: expectedId, direction: route.direction, asset: route.asset, state, createdAt,
    sourceAmount: units(source.amount).toString(), destinationAmount: units(destination.amount).toString(),
    depositAddress: toStarknet ? bitcoinAddress(source.swap_id) : null,
    recipientAddress: toStarknet ? felt(destination.redeemer) : bitcoinAddress(destination.redeemer),
    sourceTx, destinationTx, refundTx, confirmations, requiredConfirmations, refundAfterBlocks: integer(source.timelock) };
}
