import "server-only";
import { bitcoinAddress, BridgeError, checkLimits, direction, felt, object, orderId, parseBitcoinAmount, parseCatalog, parseOrder, routeAssets, text, units } from "./protocol";
import type { BridgeCall, BridgeOrder, BridgeQuote, GardenCatalog } from "./types";

// Deliberately fixed to testnet: a missing or unsupported route never falls back to mainnet.
const API = "https://testnet.api.garden.finance/v2";
function appId() {
  const key = process.env.GARDEN_APP_ID?.trim();
  if (!key) throw new BridgeError("Garden bridge is not enabled on this CAREL deployment yet.", 503, "NOT_CONFIGURED");
  return key;
}
async function request(endpoint: string, method = "GET", body?: unknown): Promise<unknown> {
  const key = appId();
  let response: Response;
  try {
    response = await fetch(`${API}${endpoint}`, { method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "garden-app-id": key, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { throw new BridgeError("Garden did not respond. Retry to recover the same order before starting another bridge.", 504, "UPSTREAM_UNAVAILABLE"); }
  if (response.status === 401 || response.status === 403) throw new BridgeError("Garden denied this server request. Check the Garden app ID and API access.", 502, "UPSTREAM_ACCESS");
  if (response.status === 429) throw new BridgeError("Garden is receiving too many requests. Please retry shortly.", 503, "UPSTREAM_BUSY");
  let payload: Record<string, unknown>;
  try { payload = object(await response.json()); } catch { throw new BridgeError("Garden returned an unreadable response.", 502, "INVALID_RESPONSE"); }
  if (!response.ok || payload.status !== "Ok") {
    const rawReason = typeof payload.error === "string"
      ? payload.error.slice(0, 220)
      : "The route or action is not currently available.";
    const reason = rawReason.replaceAll(key, "[redacted]");

    if (/no order pair found/i.test(rawReason)) {
      throw new BridgeError(
        "Garden currently has no executable solver route for this pair on testnet.",
        422,
        "NO_ROUTE",
      );
    }

    throw new BridgeError(
      `Garden: ${reason}`,
      response.status === 404 ? 404 : 422,
      "GARDEN_ERROR",
    );
  }
  return payload.result;
}
let catalogCache: { key: string; until: number; catalog: GardenCatalog } | null = null;
export async function getCatalog(): Promise<GardenCatalog> {
  const key = appId();
  if (catalogCache?.key === key && catalogCache.until > Date.now()) return catalogCache.catalog;
  const catalog = parseCatalog(await request("/assets"));
  catalogCache = { key, until: Date.now() + 30_000, catalog };
  return catalog;
}
export async function getQuote(input: unknown): Promise<BridgeQuote> {
  const body = object(input), catalog = await getCatalog();
  const route = routeAssets(catalog, body.direction, body.assetId);
  const amount = parseBitcoinAmount(body.amount);
  checkLimits(route.source, amount);
  const query = new URLSearchParams({ from: route.source.id, to: route.destination.id, from_amount: amount });
  const result = await request(`/quote?${query}`);
  if (!Array.isArray(result) || !result.length) throw new BridgeError("Garden has no executable quote for this route or amount right now.", 422, "NO_QUOTE");
  const quotes = result.map(value => {
    const quote = object(value), source = object(quote.source), destination = object(quote.destination);
    if (source.asset !== route.source.id || destination.asset !== route.destination.id || units(source.amount).toString() !== amount) throw new BridgeError("Garden returned a quote for a different route.", 502);
    const receive = units(destination.amount).toString();
    checkLimits(route.destination, receive);
    return { receive, estimatedSeconds: typeof quote.estimated_time === "number" && quote.estimated_time > 0 && Number.isFinite(quote.estimated_time) ? Math.ceil(quote.estimated_time) : null };
  }).sort((a, b) => BigInt(a.receive) === BigInt(b.receive) ? 0 : BigInt(a.receive) > BigInt(b.receive) ? -1 : 1);
  return { source: route.source, destination: route.destination, sourceAmount: amount, destinationAmount: quotes[0].receive, estimatedSeconds: quotes[0].estimatedSeconds, expiresAt: Date.now() + 45_000 };
}
async function recentRawOrders(owner: string): Promise<unknown[]> {
  const result = object(await request(`/orders?${new URLSearchParams({ address: owner, per_page: "50", page: "1" })}`));
  if (!Array.isArray(result.data)) throw new BridgeError("Garden order history is unavailable.", 502);
  return result.data;
}
export async function getOrders(ownerValue: unknown): Promise<BridgeOrder[]> {
  const owner = felt(ownerValue), catalog = await getCatalog();
  const values = await recentRawOrders(owner);
  const orders: BridgeOrder[] = [];
  for (const value of values) {
    try { orders.push(parseOrder(value, catalog, orderId(object(value).order_id), owner)); }
    catch { /* Other Garden routes are outside CAREL's Bitcoin–Starknet adapter. */ }
  }
  return orders;
}
export async function getOrder(idValue: unknown, ownerValue: unknown): Promise<BridgeOrder> {
  const id = orderId(idValue), owner = felt(ownerValue), catalog = await getCatalog();
  return parseOrder(await request(`/orders/${id}`), catalog, id, owner);
}
export async function createOrder(input: unknown): Promise<{ id: string }> {
  const body = object(input), owner = felt(body.starknetAddress), btc = bitcoinAddress(body.bitcoinAddress);
  const dir = direction(body.direction), amount = parseBitcoinAmount(body.amount), expectedReceive = units(body.expectedReceive).toString();
  const nonce = text(body.nonce, 20);
  if (!/^[1-9]\d{0,19}$/.test(nonce) || BigInt(nonce) > (1n << 64n) - 1n) throw new BridgeError("Invalid bridge request identifier.");
  const catalog = await getCatalog(), route = routeAssets(catalog, dir, body.assetId);

  // Recover accepted requests when the client lost the create response. The caller keeps this nonce on retry.
  for (const value of await recentRawOrders(owner)) {
    const raw = object(value);
    if (String(raw.nonce) !== nonce) continue;
    const order = parseOrder(raw, catalog, orderId(raw.order_id), owner);
    if (order.direction !== dir || order.asset.id !== route.asset.id || order.sourceAmount !== amount || order.destinationAmount !== expectedReceive) throw new BridgeError("This request already belongs to another order. Open Bridge activity.", 409);
    if (dir === "to-bitcoin" && bitcoinAddress(object(raw.destination_swap).redeemer) !== btc) throw new BridgeError("The saved order has a different Bitcoin recipient.", 409);
    return { id: order.id };
  }

  const fresh = await getQuote(body);
  if (fresh.destinationAmount !== expectedReceive) throw new BridgeError("The quote changed. Get a fresh quote and review the receive amount again.", 409, "QUOTE_CHANGED");
  const result = object(await request("/orders", "POST", {
    source: { asset: fresh.source.id, amount: fresh.sourceAmount, owner: dir === "to-starknet" ? btc : owner },
    destination: { asset: fresh.destination.id, amount: fresh.destinationAmount, owner: dir === "to-starknet" ? owner : btc },
    nonce, slippage: 0,
    // Omitting secret_hash selects Garden's documented preimage-manager settlement.
  }));
  // Funding details are obtained from the matched order, never blindly executed from an API response.
  return { id: orderId(result.order_id) };
}
export async function fundingCalls(idValue: unknown, ownerValue: unknown): Promise<{ calls: BridgeCall[]; order: BridgeOrder }> {
  const id = orderId(idValue), owner = felt(ownerValue), catalog = await getCatalog();
  const raw = object(await request(`/orders/${id}`));
  const order = parseOrder(raw, catalog, id, owner), source = object(raw.source_swap);
  if (order.direction !== "to-bitcoin" || order.state !== "awaiting-deposit") throw new BridgeError("This order cannot be funded. Refresh its status first.", 409);
  if (!order.asset.tokenAddress || !order.asset.htlcAddress) throw new BridgeError("Garden contracts are unavailable.", 502);
  const timelock = Number(source.timelock);
  if (!Number.isSafeInteger(timelock) || timelock <= 0 || timelock > 100_000) throw new BridgeError("Garden returned an unsupported refund timelock.", 502);
  const secretHash = text(source.secret_hash, 66).replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/i.test(secretHash)) throw new BridgeError("Invalid Garden hashlock.", 502);
  const secretWords = secretHash.match(/.{8}/g)!.map(word => `0x${word}`);
  const value = units(order.sourceAmount), low = `0x${(value & ((1n << 128n) - 1n)).toString(16)}`, high = `0x${(value >> 128n).toString(16)}`;
  return { order, calls: [
    { contractAddress: order.asset.tokenAddress, entrypoint: "approve", calldata: [order.asset.htlcAddress, low, high] },
    { contractAddress: order.asset.htlcAddress, entrypoint: "initiate", calldata: [felt(source.redeemer), `0x${timelock.toString(16)}`, low, high, ...secretWords] },
  ] };
}
export async function requestRefund(idValue: unknown, ownerValue: unknown): Promise<{ submitted: true }> {
  const id = orderId(idValue), owner = felt(ownerValue), catalog = await getCatalog();
  const raw = object(await request(`/orders/${id}`)), order = parseOrder(raw, catalog, id, owner);
  if (!order.sourceTx || order.destinationTx || order.refundTx || object(raw.source_swap).redeem_tx_hash) throw new BridgeError("This order is not eligible for a refund request.", 409);
  // Garden verifies HTLC expiry and refunds the original initiator; no alternate recipient is accepted.
  await request(`/orders/${id}?action=refund`, "PATCH", {});
  return { submitted: true };
}
