const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile the actual adapter for Node tests; no browser or chain calls are made.
require.extensions[".ts"] = (mod, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const original = mod.require.bind(mod);
  mod.require = name => name === "server-only" ? {} : original(name);
  mod._compile(source, filename);
};
const protocol = require("../lib/garden/protocol.ts");
const BTC = "tb1p4pr78swsn60y4ushe05v28mqpqppxxkfkxu2wun5jw6duc8unj3sjrh4gd";
const DEPOSIT = "tb1ptt49v22dcst7mquwfsmcu2t56xjg07whtcgufvhjuj5zu89y6q0qn8fvfp";
const OWNER = "0x123";
const ID = "a1".repeat(32);
const clone = value => structuredClone(value);
const assets = [
  { id: "bitcoin_testnet:btc", chain: "bitcoin_testnet", decimals: 8, min_amount: "1000", max_amount: "100000000" },
  { id: "starknet_sepolia:wbtc", chain: "starknet_sepolia", decimals: 8, min_amount: "1000", max_amount: "100000000", token: { address: "0x456", schema: "starknet:erc20" }, htlc: { address: "0x789", schema: "starknet:htlc_erc20" } },
];
const quote = { source: { asset: "starknet_sepolia:wbtc", amount: "50000" }, destination: { asset: "bitcoin_testnet:btc", amount: "49850" }, estimated_time: 600 };
function order(incoming = false) {
  const source = { chain: "starknet_sepolia", asset: "starknet_sepolia:wbtc", initiator: OWNER, redeemer: "0xabc", amount: "50000", filled_amount: "0", secret_hash: "ab".repeat(32), swap_id: "123456", timelock: 2880, required_confirmations: 2, current_confirmations: 0, initiate_tx_hash: "", redeem_tx_hash: "", refund_tx_hash: "", refund_block_number: "0" };
  const destination = { chain: "bitcoin_testnet", asset: "bitcoin_testnet:btc", initiator: "solver", redeemer: BTC, amount: "49850", filled_amount: "0", swap_id: DEPOSIT, initiate_tx_hash: "", redeem_tx_hash: "", redeem_block_number: "0", refund_tx_hash: "" };
  if (incoming) {
    Object.assign(source, { chain: "bitcoin_testnet", asset: "bitcoin_testnet:btc", swap_id: DEPOSIT, initiator: "public-key", redeemer: "solver" });
    Object.assign(destination, { chain: "starknet_sepolia", asset: "starknet_sepolia:wbtc", redeemer: OWNER });
  }
  return { order_id: ID, nonce: "99", created_at: new Date().toISOString(), source_swap: source, destination_swap: destination };
}
function server(t, overrides = {}) {
  const original = global.fetch, oldKey = process.env.GARDEN_APP_ID;
  process.env.GARDEN_APP_ID = "test-only-key";
  const requests = [];
  global.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://testnet.api.garden.finance");
    assert.equal(init.headers["garden-app-id"], "test-only-key");
    requests.push({ path: parsed.pathname, query: parsed.searchParams, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    const last = requests.at(-1);
    let data;
    if (parsed.pathname === "/v2/assets") data = overrides.assets || assets;
    else if (parsed.pathname === "/v2/quote") data = overrides.quotes || [quote];
    else if (parsed.pathname === "/v2/orders" && init.method === "POST") data = { order_id: ID };
    else if (parsed.pathname === "/v2/orders") data = { data: overrides.history || [] };
    else if (parsed.pathname === `/v2/orders/${ID}` && init.method === "PATCH") data = "refund-transaction";
    else if (parsed.pathname === `/v2/orders/${ID}`) data = overrides.order || order();
    else throw new Error(`Unexpected request ${last.method} ${last.path}`);
    return new Response(JSON.stringify({ status: "Ok", result: data }), { status: 200 });
  };
  const filename = path.resolve(__dirname, "../lib/garden/server.ts");
  delete require.cache[filename];
  const adapter = require(filename);
  t.after(() => { global.fetch = original; if (oldKey === undefined) delete process.env.GARDEN_APP_ID; else process.env.GARDEN_APP_ID = oldKey; });
  return { adapter, requests };
}
const createInput = { direction: "to-bitcoin", assetId: "starknet_sepolia:wbtc", amount: "0.0005", starknetAddress: OWNER, bitcoinAddress: BTC, expectedReceive: "49850", nonce: "99" };

test("amounts use exact satoshis and reject ambiguous or unsupported input", () => {
  assert.equal(protocol.parseBitcoinAmount("0.00000001"), "1");
  assert.equal(protocol.parseBitcoinAmount("0.0005"), "50000");
  assert.equal(protocol.formatBitcoinAmount("49850"), "0.00049850");
  for (const value of ["0", "-1", "1e-8", "1,000", "0.000000001", "21000001", "01.5", "Infinity"]) assert.throws(() => protocol.parseBitcoinAmount(value));
});
test("Bitcoin addresses require the testnet prefix and a valid witness checksum", () => {
  assert.equal(protocol.bitcoinAddress(BTC), BTC);
  assert.equal(protocol.bitcoinAddress(DEPOSIT), DEPOSIT);
  assert.equal(protocol.bitcoinAddress(BTC.toUpperCase()), BTC);
  for (const value of [BTC.slice(0, -1) + "q", BTC.replace("tb1", "bc1"), BTC.replace("tb1", "bcrt1"), "tb1" + "q".repeat(40), "tB" + BTC.slice(2)]) assert.throws(() => protocol.bitcoinAddress(value));
});
test("strkBTC is only offered when Garden explicitly lists it on Sepolia", () => {
  const catalog = protocol.parseCatalog(assets);
  assert.deepEqual(catalog.starknet.map(asset => asset.symbol), ["WBTC"]);
  assert.throws(() => protocol.routeAssets(catalog, "to-starknet", "starknet_sepolia:strkbtc"));
  const added = clone(assets[1]); added.id = "starknet_sepolia:strkbtc";
  assert.deepEqual(protocol.parseCatalog([...assets, added]).starknet.map(asset => asset.symbol), ["strkBTC", "WBTC"]);
  const wrongChain = clone(assets); wrongChain[1].chain = "starknet";
  assert.throws(() => protocol.parseCatalog(wrongChain));
});
test("agent bridge goals retain amount, asset and testnet direction", () => {
  assert.deepEqual(protocol.parseBridgeGoal("Bridge 0.002 BTC to Starknet Sepolia."), { amount: "0.002", direction: "to-starknet", symbol: "BTC" });
  assert.equal(protocol.parseBridgeGoal("Bridge 0.001 strkBTC to Bitcoin Testnet4").symbol, "strkBTC");
  for (const value of ["Bridge 1 STRK to Ethereum", "Bridge 1 BTC to Starknet mainnet", "Bridge 1e-8 BTC to Starknet Sepolia", "Bridge 0 BTC to Starknet Sepolia"]) assert.throws(() => protocol.parseBridgeGoal(value));
});
test("orders are scoped to the intended wallet and reject mainnet legs", () => {
  const catalog = protocol.parseCatalog(assets);
  assert.equal(protocol.parseOrder(order(), catalog, ID, "0x0123").state, "awaiting-deposit");
  assert.equal(protocol.parseOrder(order(true), catalog, ID, OWNER).depositAddress, DEPOSIT);
  assert.equal(protocol.parseOrder(order(), catalog, ID, OWNER).recipientAddress, BTC);
  assert.equal(protocol.parseOrder(order(true), catalog, ID, OWNER).recipientAddress, OWNER);
  const badRecipient = order(); badRecipient.destination_swap.redeemer = BTC.replace("tb1", "bc1");
  assert.throws(() => protocol.parseOrder(badRecipient, catalog, ID, OWNER));
  assert.throws(() => protocol.parseOrder(order(), catalog, ID, "0x124"));
  const wrong = order(); wrong.destination_swap.chain = "bitcoin";
  assert.throws(() => protocol.parseOrder(wrong, catalog, ID, OWNER));
});
test("source confirmation alone never marks a bridge as delivered", () => {
  const catalog = protocol.parseCatalog(assets), value = order();
  value.source_swap.initiate_tx_hash = "0x1"; value.source_swap.current_confirmations = 2;
  assert.equal(protocol.parseOrder(value, catalog, ID, OWNER).state, "exchanging");
  value.destination_swap.redeem_tx_hash = "a".repeat(64);
  assert.equal(protocol.parseOrder(value, catalog, ID, OWNER).state, "settling");
  value.destination_swap.redeem_block_number = "40";
  assert.equal(protocol.parseOrder(value, catalog, ID, OWNER).state, "completed");
});
test("unfunded stale orders expire; refund status is based on the refund transaction", () => {
  const catalog = protocol.parseCatalog(assets), value = order();
  value.created_at = new Date(Date.now() - 3_600_001).toISOString();
  assert.equal(protocol.parseOrder(value, catalog, ID, OWNER).state, "expired");
  value.source_swap.refund_tx_hash = "0x42";
  assert.equal(protocol.parseOrder(value, catalog, ID, OWNER).state, "refunding");
  value.source_swap.refund_block_number = "30";
  assert.equal(protocol.parseOrder(value, catalog, ID, OWNER).state, "refunded");
});
test("a fresh executable quote is required, with the exact reviewed receive amount", async t => {
  const { adapter, requests } = server(t);
  const result = await adapter.getQuote(createInput);
  assert.equal(result.destinationAmount, "49850");
  await assert.rejects(adapter.createOrder({ ...createInput, expectedReceive: "49999" }), /quote changed/i);
  assert.equal(requests.filter(item => item.method === "POST").length, 0);
});
test("order creation passes exact amounts, zero slippage, owners and recovery nonce", async t => {
  const { adapter, requests } = server(t);
  assert.deepEqual(await adapter.createOrder(createInput), { id: ID });
  const sent = requests.find(item => item.method === "POST").body;
  assert.equal(sent.source.asset, "starknet_sepolia:wbtc");
  assert.equal(sent.source.owner, OWNER);
  assert.equal(sent.source.amount, "50000");
  assert.equal(sent.destination.owner, BTC);
  assert.equal(sent.destination.amount, "49850");
  assert.equal(sent.slippage, 0);
  assert.equal(sent.nonce, "99");
  assert.equal("secret_hash" in sent, false);
});
test("retry recovers the existing order without creating another one", async t => {
  const { adapter, requests } = server(t, { history: [order()] });
  assert.deepEqual(await adapter.createOrder(createInput), { id: ID });
  assert.equal(requests.filter(item => item.method === "POST").length, 0);
});
test("Bitcoin deposits bind the refund address and the Sepolia recipient to their correct legs", async t => {
  const incomingQuote = { source: { asset: "bitcoin_testnet:btc", amount: "50000" }, destination: { asset: "starknet_sepolia:wbtc", amount: "49850" } };
  const { adapter, requests } = server(t, { quotes: [incomingQuote] });
  assert.deepEqual(await adapter.createOrder({ ...createInput, direction: "to-starknet" }), { id: ID });
  const sent = requests.find(item => item.method === "POST").body;
  assert.deepEqual(sent.source, { asset: "bitcoin_testnet:btc", amount: "50000", owner: BTC });
  assert.deepEqual(sent.destination, { asset: "starknet_sepolia:wbtc", amount: "49850", owner: OWNER });
});
test("funding reconstructs bounded approval and cannot execute arbitrary API calls", async t => {
  const { adapter } = server(t);
  const result = await adapter.fundingCalls(ID, OWNER);
  const calls = protocol.validateFundingCalls(result.calls);
  assert.equal(calls[0].entrypoint, "approve");
  assert.deepEqual(calls[0].calldata, ["0x789", "0xc350", "0x0"]);
  assert.equal(calls[1].entrypoint, "initiate");
  assert.equal(calls[1].calldata.length, 12);
  const unlimited = clone(calls); unlimited[0].calldata[1] = "0xffffffffffffffffffffffffffffffff";
  assert.throws(() => protocol.validateFundingCalls(unlimited));
  const badTarget = clone(calls); badTarget[0].calldata[0] = "0x999";
  assert.throws(() => protocol.validateFundingCalls(badTarget));
  const arbitrary = clone(calls); arbitrary[1].entrypoint = "transfer";
  assert.throws(() => protocol.validateFundingCalls(arbitrary));
});
test("already-funded orders cannot initiate a second funding transaction", async t => {
  const value = order(); value.source_swap.initiate_tx_hash = "0x1";
  const { adapter } = server(t, { order: value });
  await assert.rejects(adapter.fundingCalls(ID, OWNER), /cannot be funded/i);
});
test("refund requests cannot change the recipient and require a funded unsettled order", async t => {
  const value = order(); value.source_swap.initiate_tx_hash = "0x1";
  const { adapter, requests } = server(t, { order: value });
  await adapter.requestRefund(ID, OWNER);
  const sent = requests.find(item => item.method === "PATCH");
  assert.equal(sent.query.get("action"), "refund"); assert.deepEqual(sent.body, {});
  value.destination_swap.redeem_tx_hash = "1".repeat(64);
  await assert.rejects(adapter.requestRefund(ID, OWNER), /not eligible/i);
});
test("missing credentials fail closed before contacting Garden", async t => {
  const { adapter, requests } = server(t);
  delete process.env.GARDEN_APP_ID;
  await assert.rejects(adapter.getCatalog(), error => error.code === "NOT_CONFIGURED");
  assert.equal(requests.length, 0);
});
