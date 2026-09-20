"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  constants,
  type Call,
  num,
  RpcProvider,
  transaction,
  walletV6,
  WalletAccountV6,
} from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import {
  quoteToCalls,
  type Quote,
} from "@avnu/avnu-sdk";
import type { BridgeCall } from "@/lib/garden/types";
import { felt, validateFundingCalls } from "@/lib/garden/protocol";
import {
  createStore,
  type Store,
} from "@starknet-io/get-starknet-discovery";
import {
  StandardConnect,
  type WalletWithStarknetFeatures,
} from "@starknet-io/get-starknet-wallet-standard/features";
import type {
  WalletWithStarknetFeatures as WalletWithStarknetFeaturesV6,
} from "@starknet-io/get-starknet-wallet-standard-v6/features";
import {
  Check,
  ChevronDown,
  EyeOff,
  LockKeyhole,
  RefreshCw,
  Shield,
  Unlock,
  WalletCards,
} from "lucide-react";
import {
  SEPOLIA_EXPLORER_TX,
  SEPOLIA_RPC,
  STRK_TOKEN,
  sepoliaProvider,
} from "@/lib/strk20/config";
import {
  formatUnits18,
  parseUnits18,
  sameFelt,
} from "@/lib/strk20/units";
import {
  ENDUR_DEPOSIT_ANONYMIZER,
  ENDUR_XSTRK_TOKEN,
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  clearBalancesByVisibility,
  findAssetBalance,
  mergeBalances,
  type AssetBalance,
} from "@/lib/carel/core/balances";

import {
  parseUnits,
} from "@/lib/carel/core/amounts";

import {
  privateBalanceTokenAddresses,
  readStarknetPublicBalances,
  readStrk20PrivateBalances,
  readStrk20TokenAmount,
  requireStarknetBalanceAddress,
} from "@/lib/carel/ecosystems/starknet/balances";

import type {
  BorrowIntent,
  CollateralIntent,
  RepayIntent,
} from "@/lib/carel/core/execution";

import {
  validateVesuBorrowCalls,
  validateVesuClosePositionCalls,
  validateVesuRepayCalls,
  type VesuBorrowExecutionPayload,
  type VesuBorrowMarket,
  type VesuCloseExecutionPayload,
  type VesuRepayExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/borrow";

import {
  getVesuPool,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pools";

import {
  getVesuBorrowPair,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/pairs";

import {
  getVesuLendPair,
  validateVesuLendCalls,
  type VesuLendExecutionPayload,
  type VesuLendIntent,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/lending";

import {
  buildVesuShieldLendActions,
  configuredVesuLendingAnonymizer,
  VESU_LENDING_ANONYMIZER_CLASS_HASH,
  VESU_MAINNET_POOL_FACTORY,
  type VesuShieldLendExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/private-lending";

import {
  validateVesuAddCollateralCalls,
  validateVesuWithdrawCollateralCalls,
  type VesuAddCollateralExecutionPayload,
  type VesuWithdrawCollateralExecutionPayload,
} from "@/lib/carel/ecosystems/starknet/protocols/vesu/collateral";

type StakingAction =
  | "stake"
  | "initiateUnstake"
  | "completeUnstake"
  | "claimRewards";

type TxState =
  | { kind: "idle" }
  | { kind: "pending"; label: string; hash: string }
  | { kind: "confirmed"; label: string; hash: string }
  | { kind: "submitted"; label: string; hash: string };

export type PrivateTransferResult =
  Readonly<{
    hash: string;
    status:
      | "confirmed"
      | "submitted";
  }>;

type CarelTestnetContextValue = {
  wallets: WalletWithStarknetFeatures[];
  address: string;
  chainId: string;
  connected: boolean;
  connecting: boolean;
  strk20Capable: boolean;
  specs: string[];
  publicStrk: bigint | null;
  privateStrk: bigint | null;
  privateXstrk: bigint | null;
  balances: readonly AssetBalance[];
  privateRevealed: boolean;
  busy: boolean;
  error: string | null;
  tx: TxState;
  maturityTarget: number | null;
  currentBlock: number | null;
  connect: (walletName?: string) => Promise<void>;
  disconnect: () => void;
  refreshPublicBalance: () => Promise<void>;
  refreshAssetBalances: () => Promise<void>;
  revealPrivateBalance: () => Promise<void>;
  shield: (amount: string) => Promise<void>;
  unshield: (amount: string) => Promise<void>;
  executeShieldAsset: (
    assetId: string,
    amount: string,
    label: string,
  ) => Promise<PrivateTransferResult>;
  executeUnshieldAsset: (
    assetId: string,
    amount: string,
    label: string,
  ) => Promise<PrivateTransferResult>;
  executeUnshieldCollateral: (
    amount: string,
    label: string,
  ) => Promise<PrivateTransferResult>;
  executeSwap: (
    quote: Quote,
    expectedSellToken: string,
    expectedBuyToken: string,
    label: string,
  ) => Promise<string>;
  executeShieldSwap: (
    quote: Quote,
    expectedSellToken: string,
    expectedBuyToken: string,
    label: string,
  ) => Promise<string>;
  executeUnshieldSwapStart: (
    quote: Quote,
    expectedSellToken: string,
    expectedBuyToken: string,
    label: string,
  ) => Promise<{
    hash: string;
    privateBuyBefore: bigint;
    maturityTarget: number;
  }>;
  completeUnshieldSwap: (
    token: string,
    privateBuyBefore: bigint,
    minExpected: bigint,
    maturityTarget: number,
    label: string,
  ) => Promise<{
    hash: string;
    amount: bigint;
  }>;
  executeStaking: (
    amount: string,
    poolAddress: string,
    tokenAddress: string,
    label: string,
  ) => Promise<string>;
  executeStakingAction: (
    action: StakingAction,
    amount: string | null,
    poolAddress: string,
    tokenAddress: string,
    label: string,
  ) => Promise<string>;
  executeShieldStaking: (
    amount: string,
    feeAmount: string,
    label: string,
  ) => Promise<string>;
  executeBridge: (calls: BridgeCall[], expectedAddress: string) => Promise<string>;
  executeShieldLend: (
    payload: VesuShieldLendExecutionPayload,
    label: string,
  ) => Promise<PrivateTransferResult>;
  executeLend: (
    payload: VesuLendExecutionPayload,
    label: string,
  ) => Promise<string>;
  executeBorrow: (
    payload: VesuBorrowExecutionPayload,
    label: string,
  ) => Promise<string>;
  executeRepay: (
    payload: VesuRepayExecutionPayload,
    label: string,
  ) => Promise<string>;
  executeCloseVesuPosition: (
    payload: VesuCloseExecutionPayload,
    label: string,
  ) => Promise<string>;
  executeAddVesuCollateral: (
    payload: VesuAddCollateralExecutionPayload,
    label: string,
  ) => Promise<string>;
  executeWithdrawVesuCollateral: (
    payload: VesuWithdrawCollateralExecutionPayload,
    label: string,
  ) => Promise<string>;
};

const CarelTestnetContext = createContext<CarelTestnetContextValue | null>(null);

// Keep one discovery store alive for the page lifetime.
// Android extension hosts such as Mises can inject Ready after React mounts.
const walletStore: Store = createStore({ eip1193Adapters: [] });

function refreshInjectedWallets() {
  if (typeof window === "undefined") return;

  walletStore._refreshInjectedWallets();
}

function getDiscoveredWallets(): WalletWithStarknetFeatures[] {
  return walletStore
    .getWallets()
    .filter((wallet) => {
      const id = normalizeWalletName(wallet.name);

      return !id.includes("metamask") && !id.includes("braavos");
    })
    .slice();
}

function normalizeWalletName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function supportsStrk20(specs: string[]) {
  return specs.some((value) => {
    const match = value.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return false;

    const major = Number(match[1]);
    const minor = Number(match[2]);

    return major > 0 || minor >= 10;
  });
}

function shortAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function waitForSubmittedTransaction(
  hash: string,
  provider: RpcProvider = sepoliaProvider,
) {
  const confirmation = provider.waitForTransaction(hash, {
    retries: 120,
    retryInterval: 3000,
  });

  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new Error("Confirmation is taking longer than expected.")),
      120_000,
    );
  });

  await Promise.race([confirmation, timeout]);
}

function validateAvnuBuiltCalls(
  calls: Call[],
  sellTokenAddress: string,
  sellAmount: bigint,
  exchangeAddress: string,
): Call[] {
  if (!Array.isArray(calls) || calls.length < 1 || calls.length > 3) {
    throw new Error(
      "CAREL blocked an unexpected AVNU transaction shape.",
    );
  }

  const sellToken = felt(sellTokenAddress);
  const exchange = felt(exchangeAddress);
  let swapCalls = 0;

  for (const call of calls) {
    const target = felt(call.contractAddress);
    const entrypoint = String(call.entrypoint ?? "");
    const rawCalldata = call.calldata ?? [];

    if (!Array.isArray(rawCalldata)) {
      throw new Error(
        "CAREL blocked malformed AVNU calldata.",
      );
    }

    const calldata = rawCalldata.map(
      (value) => String(value),
    );

    if (target === sellToken) {
      if (
        entrypoint !== "approve" ||
        calldata.length !== 3
      ) {
        throw new Error(
          "CAREL blocked an unexpected AVNU token call.",
        );
      }

      if (felt(calldata[0]) !== exchange) {
        throw new Error(
          "CAREL blocked an AVNU approval to an unknown spender.",
        );
      }

      let approved: bigint;

      try {
        approved =
          BigInt(calldata[1]) +
          (BigInt(calldata[2]) << 128n);
      } catch {
        throw new Error(
          "CAREL blocked malformed AVNU approval data.",
        );
      }

      if (approved !== sellAmount) {
        throw new Error(
          "CAREL blocked an AVNU approval with the wrong amount.",
        );
      }

      continue;
    }

    if (target === exchange) {
      if (
        entrypoint !== "multi_route_swap" &&
        entrypoint !== "swap_exact_token_to"
      ) {
        throw new Error(
          "CAREL blocked an unexpected AVNU Exchange entrypoint.",
        );
      }

      swapCalls += 1;
      continue;
    }

    throw new Error(
      "CAREL blocked an AVNU call to an unapproved contract.",
    );
  }

  if (swapCalls !== 1) {
    throw new Error(
      "CAREL requires exactly one AVNU Exchange swap call.",
    );
  }

  return calls;
}


function validateAvnuStakingCalls(
  calls: Call[],
  action: StakingAction,
  tokenAddress: string,
  poolAddress: string,
  ownerAddress: string,
  amount: bigint | null,
): Call[] {
  const token = felt(tokenAddress);
  const pool = felt(poolAddress);
  const owner = felt(ownerAddress);

  if (
    action !== "stake"
  ) {
    if (calls.length !== 1) {
      throw new Error(
        "CAREL blocked an unexpected staking action shape.",
      );
    }

    const call = calls[0];

    if (
      felt(call.contractAddress) !== pool
    ) {
      throw new Error(
        "CAREL blocked a staking action to an unknown contract.",
      );
    }

    const rawCalldata =
      call.calldata ?? [];

    if (
      !Array.isArray(rawCalldata)
    ) {
      throw new Error(
        "CAREL blocked malformed staking calldata.",
      );
    }

    const calldata =
      rawCalldata.map(String);

    if (
      action ===
        "initiateUnstake"
    ) {
      if (
        call.entrypoint !==
          "exit_delegation_pool_intent" ||
        calldata.length !== 1 ||
        amount === null ||
        BigInt(calldata[0]) !==
          amount
      ) {
        throw new Error(
          "CAREL blocked an unexpected unstake intent.",
        );
      }

      return calls;
    }

    const expectedEntrypoint =
      action ===
        "completeUnstake"
        ? "exit_delegation_pool_action"
        : "claim_rewards";

    if (
      call.entrypoint !==
        expectedEntrypoint ||
      calldata.length !== 1 ||
      felt(calldata[0]) !== owner
    ) {
      throw new Error(
        "CAREL blocked an unexpected staking account action.",
      );
    }

    return calls;
  }

  if (
    amount === null ||
    !Array.isArray(calls) ||
    calls.length < 1 ||
    calls.length > 2
  ) {
    throw new Error(
      "CAREL blocked an unexpected staking transaction shape.",
    );
  }

  let approvals = 0;
  let poolCalls = 0;

  for (const call of calls) {
    const target =
      felt(call.contractAddress);

    const entrypoint =
      String(
        call.entrypoint ?? "",
      );

    const rawCalldata =
      call.calldata ?? [];

    if (
      !Array.isArray(rawCalldata)
    ) {
      throw new Error(
        "CAREL blocked malformed staking calldata.",
      );
    }

    const calldata =
      rawCalldata.map(String);

    if (target === token) {
      if (
        entrypoint !== "approve" ||
        calldata.length !== 3
      ) {
        throw new Error(
          "CAREL blocked an unexpected staking token call.",
        );
      }

      if (
        felt(calldata[0]) !== pool
      ) {
        throw new Error(
          "CAREL blocked staking approval to an unknown spender.",
        );
      }

      const approved =
        BigInt(calldata[1]) +
        (
          BigInt(calldata[2]) <<
          128n
        );

      if (
        approved !== amount
      ) {
        throw new Error(
          "CAREL blocked staking approval with the wrong amount.",
        );
      }

      approvals += 1;

      if (approvals > 1) {
        throw new Error(
          "CAREL blocked duplicate staking approvals.",
        );
      }

      continue;
    }

    if (target === pool) {
      if (
        entrypoint !==
          "enter_delegation_pool" &&
        entrypoint !==
          "add_to_delegation_pool"
      ) {
        throw new Error(
          "CAREL blocked an unexpected staking pool entrypoint.",
        );
      }

      if (
        calldata.length !== 2 ||
        felt(calldata[0]) !==
          owner ||
        BigInt(calldata[1]) !==
          amount
      ) {
        throw new Error(
          "CAREL blocked staking with unexpected calldata.",
        );
      }

      poolCalls += 1;
      continue;
    }

    throw new Error(
      "CAREL blocked a staking call to an unapproved contract.",
    );
  }

  if (poolCalls !== 1) {
    throw new Error(
      "CAREL requires exactly one staking pool call.",
    );
  }

  return calls;
}

export function CarelTestnetProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const [walletAccount, setWalletAccount] = useState<WalletAccountV6 | null>(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [specs, setSpecs] = useState<string[]>([]);
  const [publicStrk, setPublicStrk] = useState<bigint | null>(null);
  const [privateStrk, setPrivateStrk] = useState<bigint | null>(null);
  const [privateXstrk, setPrivateXstrk] = useState<bigint | null>(null);
  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [privateRevealed, setPrivateRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [maturityTarget, setMaturityTarget] = useState<number | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  const bridgeSubmitting = useRef(false);
  const swapSubmitting = useRef(false);
  const stakingSubmitting = useRef(false);
  const lendSubmitting = useRef(false);
  const borrowSubmitting = useRef(false);
  const repaySubmitting = useRef(false);
  const closeVesuSubmitting = useRef(false);
  const addVesuCollateralSubmitting = useRef(false);
  const withdrawVesuCollateralSubmitting = useRef(false);
  const currentAccount = useRef(walletAccount);
  currentAccount.current = walletAccount;

  const connected = Boolean(address && walletAccount);
  const strk20Capable = supportsStrk20(specs);

  useEffect(() => {
    const syncWallets = () => {
      refreshInjectedWallets();
      setWallets(getDiscoveredWallets());
    };

    syncWallets();

    const unsubscribe = walletStore.subscribe(() => {
      setWallets(getDiscoveredWallets());
    });

    // Ready can appear after React has mounted in Android/Mises.
    const timers = [150, 400, 900, 1800, 3500, 6000].map((ms) =>
      window.setTimeout(syncWallets, ms),
    );

    const polling = window.setInterval(syncWallets, 1500);
    const stopPolling = window.setTimeout(
      () => window.clearInterval(polling),
      30000,
    );

    const onFocus = () => syncWallets();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        syncWallets();
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(polling);
      window.clearTimeout(stopPolling);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!maturityTarget) return;

    const network = getCarelNetwork(chainId);
    if (!network?.privacyEnabled) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const block = Number(
          await network.provider.getBlockNumber(),
        );
        if (!cancelled) setCurrentBlock(block);
      } catch {
        // The tracker is supplementary; transaction state remains visible.
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 6000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [maturityTarget, chainId]);

  /**
   * Refreshes every registered public asset on the connected Starknet chain.
   * Legacy publicStrk is updated from the same generic snapshot.
   */
  const refreshAssetBalances = async () => {
    if (!address) {
      return;
    }

    const network =
      getCarelNetwork(
        chainId,
      );

    if (!network) {
      throw new Error(
        "CAREL supports Starknet Sepolia and Starknet Mainnet.",
      );
    }

    const observed =
      await readStarknetPublicBalances(
        address,
        network.provider,
        network.assetList,
      );

    setBalances(
      (current) =>
        mergeBalances(
          current,
          observed,
        ),
    );

    const strk =
      findAssetBalance(
        observed,
        network.assets.strk.id,
        "public",
      );

    setPublicStrk(
      strk?.amount ?? null,
    );
  };

  /**
   * Compatibility action used by the existing UI.
   * It now refreshes the complete public asset snapshot, not STRK alone.
   */
  const refreshPublicBalance = async () => {
    if (!address) {
      return;
    }

    setError(null);

    try {
      await refreshAssetBalances();
      setError(null);
    } catch (cause) {
      setPublicStrk(null);

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not read public asset balances.",
      );
    }
  };

  const connect = async (walletName?: string) => {
    setConnecting(true);
    setError(null);

    try {
      // Force a fresh Android/Mises injection scan before giving up.
      refreshInjectedWallets();

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 200);
      });

      let discovered = getDiscoveredWallets();

      if (!discovered.length) {
        refreshInjectedWallets();

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 500);
        });

        discovered = getDiscoveredWallets();
      }

      setWallets(discovered);

      if (!discovered.length) {
        throw new Error(
          "Ready was not detected. Unlock Ready, return to CAREL, then tap Connect again.",
        );
      }

      const requested = walletName
        ? discovered.find(
            (wallet) =>
              normalizeWalletName(wallet.name) ===
              normalizeWalletName(walletName),
          )
        : undefined;

      const ready =
        discovered.find((wallet) =>
          normalizeWalletName(wallet.name).includes("ready"),
        ) ?? discovered[0];

      const selected = requested ?? ready;

      // Connect through Wallet Standard first.
      // This is the same connection boundary used by the working VINSS flow.
      const connection =
        await selected.features[StandardConnect].connect({
          silent: false,
        });

      if (!connection.accounts.length) {
        throw new Error("Wallet connected without returning an account.");
      }

      // starknet.js 10.4 carries the Wallet Standard v6 package under
      // an alias. Same runtime wallet, different TypeScript identity.
      const selectedV6 =
        selected as unknown as WalletWithStarknetFeaturesV6;

      const nextChainId = String(
        await walletV6.requestChainId(selectedV6),
      );

      const network = getCarelNetwork(nextChainId);

      if (!network) {
        throw new Error(
          "CAREL supports Starknet Sepolia and Starknet Mainnet.",
        );
      }

      const account = await WalletAccountV6.connect(
        { nodeUrl: network.rpcUrl },
        selectedV6,
      );

      const nextAddress = account.address;

      // Capability check only: does not request private balances.
      const supported =
        await walletV6.supportedWalletApi(selectedV6);

      const nextSpecs = Array.isArray(supported)
        ? supported.map((value) => String(value))
        : [];

      setWalletAccount(account);
      setAddress(nextAddress);
      setChainId(nextChainId);
      setSpecs(nextSpecs);
      setPrivateStrk(null);
      setPrivateXstrk(null);
      setPrivateRevealed(false);
      setBalances([]);
      setTx({ kind: "idle" });

      try {
        const observed =
          await readStarknetPublicBalances(
            nextAddress,
            network.provider,
            network.assetList,
          );

        setBalances(
          observed,
        );

        setPublicStrk(
          findAssetBalance(
            observed,
            network.assets.strk.id,
            "public",
          )?.amount ?? null,
        );
      } catch {
        setPublicStrk(null);
        setBalances([]);
      }
    } catch (cause) {
      console.error("[CAREL] wallet connect failed", cause);

      setError(
        cause instanceof Error
          ? cause.message
          : "Wallet connection failed.",
      );
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setWalletAccount(null);
    setAddress("");
    setChainId("");
    setSpecs([]);
    setPublicStrk(null);
    setPrivateStrk(null);
    setPrivateXstrk(null);
    setPrivateRevealed(false);
    setBalances([]);
    setTx({ kind: "idle" });
    setMaturityTarget(null);
    setCurrentBlock(null);
    setError(null);
  };

  const assertPrivateReady = () => {
    if (!walletAccount || !address) {
      throw new Error("Connect a wallet first.");
    }

    const network = getCarelNetwork(chainId);

    if (!network?.privacyEnabled) {
      throw new Error(
        "STRK20 privacy is not enabled for this Starknet network.",
      );
    }

    if (!strk20Capable) {
      throw new Error(
        "This wallet does not report STRK20 Wallet API support (>= 0.10).",
      );
    }

    return {
      account: walletAccount,
      network,
    };
  };

  /**
   * Requests one explicit STRK20 disclosure for all registered private assets.
   * STRK, USDC, and mainnet xSTRK therefore share one balance infrastructure.
   */
  const revealPrivateBalance = async () => {
    setBusy(true);
    setError(null);

    try {
      const {
        account,
        network,
      } =
        assertPrivateReady();

      const result =
        await account.strk20Balances(
          privateBalanceTokenAddresses(
            network.assetList,
          ),
        );

      const observed =
        readStrk20PrivateBalances(
          result,
          network.assetList,
        );

      setBalances(
        (current) =>
          mergeBalances(
            clearBalancesByVisibility(
              current,
              "private",
            ),
            observed,
          ),
      );

      setPrivateStrk(
        findAssetBalance(
          observed,
          network.assets.strk.id,
          "private",
        )?.amount ?? 0n,
      );

      const xstrk =
        network.assetList.find(
          (asset) =>
            asset.symbol ===
            "xSTRK",
        );

      setPrivateXstrk(
        xstrk
          ? findAssetBalance(
              observed,
              xstrk.id,
              "private",
            )?.amount ?? 0n
          : null,
      );

      setPrivateRevealed(
        true,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not read private balances.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = async (
    label: string,
    actions: WALLET_API.STRK20_ACTION[],
    trackMaturity: boolean,
  ): Promise<PrivateTransferResult> => {
    const {
      account,
      network,
    } = assertPrivateReady();

    // Re-check account/network immediately before the private wallet request.
    const selected =
      account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

    const [
      walletChain,
      accounts,
    ] = await Promise.all([
      walletV6.requestChainId(
        selected,
      ),
      account.requestAccounts(
        true,
      ),
    ]);

    if (
      currentAccount.current !==
        account ||
      String(walletChain) !==
        network.chainId ||
      !accounts[0] ||
      felt(accounts[0]) !==
        felt(account.address)
    ) {
      throw new Error(
        "Wallet account or network changed. Reconnect Ready before continuing.",
      );
    }

    const response =
      await account
        .strk20InvokeTransaction(
          actions,
        );

    const hash =
      response.transaction_hash;

    if (
      !/^0x[0-9a-f]{1,64}$/i.test(
        hash,
      )
    ) {
      throw new Error(
        "Ready did not return a valid private transaction hash.",
      );
    }

    setTx({
      kind: "pending",
      label,
      hash,
    });

    let status:
      PrivateTransferResult["status"] =
        "submitted";

    try {
      await waitForSubmittedTransaction(
        hash,
        network.provider,
      );

      status = "confirmed";

      setTx({
        kind: "confirmed",
        label,
        hash,
      });

      if (trackMaturity) {
        const block =
          Number(
            await network.provider
              .getBlockNumber(),
          );

        setCurrentBlock(block);
        setMaturityTarget(
          block + 10,
        );
      }
    } catch {
      setTx({
        kind: "submitted",
        label,
        hash,
      });
    }

    await refreshPublicBalance();

    return {
      hash,
      status,
    };
  };

  const shield = async (amount: string) => {
    setBusy(true);
    setError(null);

    try {
      const units = parseUnits18(amount);
      if (units <= 0n) throw new Error("Shield amount must be greater than zero.");

      await submit(
        `Shield ${amount} STRK`,
        [
          {
            type: "deposit",
            token: felt(STRK_TOKEN),
            amount: num.toHex(units),
          },
        ],
        true,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shield failed.");
    } finally {
      setBusy(false);
    }
  };

  const unshield = async (amount: string) => {
    setBusy(true);
    setError(null);

    try {
      const units = parseUnits18(amount);
      if (units <= 0n) throw new Error("Unshield amount must be greater than zero.");

      await submit(
        `Unshield ${amount} STRK`,
        [
          {
            type: "withdraw",
            token: felt(STRK_TOKEN),
            amount: num.toHex(units),
            recipient: felt(address),
          },
        ],
        false,
      );

      if (privateRevealed) {
        try {
          const { account } = assertPrivateReady();
          const result = await account.strk20Balances([STRK_TOKEN]);
          setPrivateStrk(readStrk20TokenAmount(result, STRK_TOKEN));
        } catch {
          // Keep the previous disclosed balance if refresh is rejected/unavailable.
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unshield failed.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Moves one registered public Starknet asset into STRK20 privacy.
   *
   * Used by composed flows such as Shield Borrow, where the public
   * protocol execution is reviewed separately from the privacy deposit.
   */
  const executeShieldAsset = async (
    assetId: string,
    amount: string,
    label: string,
  ): Promise<PrivateTransferResult> => {
    if (
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const {
      network,
    } =
      assertPrivateReady();

    const asset =
      network.assetList.find(
        (candidate) =>
          candidate.id ===
          assetId,
      );

    if (!asset) {
      throw new Error(
        "CAREL does not recognize this Shield asset on the connected network.",
      );
    }

    let units:
      bigint;

    try {
      units =
        parseUnits(
          amount,
          asset.decimals,
        );
    } catch {
      throw new Error(
        `Enter a valid ${asset.symbol} amount.`,
      );
    }

    if (
      units <= 0n
    ) {
      throw new Error(
        `Shield ${asset.symbol} amount must be greater than zero.`,
      );
    }

    const publicBalance =
      findAssetBalance(
        balances,
        asset.id,
        "public",
      )?.amount;

    if (
      publicBalance !==
        null &&
      publicBalance !==
        undefined &&
      publicBalance <
        units
    ) {
      throw new Error(
        `Insufficient public ${asset.symbol} balance for Shield.`,
      );
    }

    const token =
      felt(
        requireStarknetBalanceAddress(
          asset,
        ),
      );

    setBusy(true);
    setError(null);

    try {
      const result =
        await submit(
          label,
          [
            {
              type:
                "deposit",

              token,

              amount:
                num.toHex(
                  units,
                ),
            },
          ],
          true,
        );

      /*
       * A new private note now exists, but the previous disclosure
       * snapshot is stale and the note may still be maturing.
       */
      setPrivateStrk(null);
      setPrivateXstrk(null);
      setPrivateRevealed(false);

      setBalances(
        (current) =>
          clearBalancesByVisibility(
            current,
            "private",
          ),
      );

      return result;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : `Shield ${asset.symbol} failed.`;

      setError(
        message,
      );

      throw new Error(
        message,
      );
    } finally {
      setBusy(false);
    }
  };


  /**
   * Moves one explicitly disclosed private asset back to the public wallet.
   *
   * The caller receives confirmation state so a downstream public protocol
   * remains locked until the privacy withdrawal is confirmed.
   */
  const executeUnshieldAsset = async (
    assetId: string,
    amount: string,
    label: string,
  ): Promise<PrivateTransferResult> => {
    if (
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const {
      account,
      network,
    } =
      assertPrivateReady();

    const asset =
      network.assetList.find(
        (candidate) =>
          candidate.id ===
          assetId,
      );

    if (!asset) {
      throw new Error(
        "CAREL does not recognize this Unshield asset on the connected network.",
      );
    }

    let units:
      bigint;

    try {
      units =
        parseUnits(
          amount,
          asset.decimals,
        );
    } catch {
      throw new Error(
        `Enter a valid ${asset.symbol} amount.`,
      );
    }

    if (
      units <= 0n
    ) {
      throw new Error(
        `Unshield ${asset.symbol} amount must be greater than zero.`,
      );
    }

    if (
      !privateRevealed
    ) {
      throw new Error(
        `Reveal private ${asset.symbol} before continuing.`,
      );
    }

    const privateBalance =
      findAssetBalance(
        balances,
        asset.id,
        "private",
      )?.amount ??
      0n;

    if (
      privateBalance <
      units
    ) {
      throw new Error(
        `Private ${asset.symbol} balance is below the requested amount.`,
      );
    }

    const token =
      felt(
        requireStarknetBalanceAddress(
          asset,
        ),
      );

    setBusy(true);
    setError(null);

    try {
      const result =
        await submit(
          label,
          [
            {
              type:
                "withdraw",

              token,

              amount:
                num.toHex(
                  units,
                ),

              recipient:
                felt(
                  account.address,
                ),
            },
          ],
          false,
        );

      /*
       * Spending any disclosed note invalidates the complete private
       * snapshot. Require a fresh Reveal before another private action.
       */
      setPrivateStrk(null);
      setPrivateXstrk(null);
      setPrivateRevealed(false);

      setBalances(
        (current) =>
          clearBalancesByVisibility(
            current,
            "private",
          ),
      );

      return result;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : `Unshield ${asset.symbol} failed.`;

      setError(
        message,
      );

      throw new Error(
        message,
      );
    } finally {
      setBusy(false);
    }
  };


  /**
   * Moves reviewed private STRK collateral back to the public wallet.
   *
   * Unlike the generic quick Unshield action, this method propagates errors
   * and returns confirmation state so a downstream public protocol cannot
   * execute before the privacy withdrawal is confirmed.
   */
  const executeUnshieldCollateral = async (
    amount: string,
    label: string,
  ): Promise<PrivateTransferResult> => {
    if (
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const {
      account,
      network,
    } = assertPrivateReady();

    if (
      network.id !==
        "mainnet"
    ) {
      throw new Error(
        "Unshield Borrow is currently enabled on Starknet Mainnet only.",
      );
    }

    const units =
      parseUnits18(
        amount,
      );

    if (units <= 0n) {
      throw new Error(
        "Unshield collateral must be greater than zero.",
      );
    }

    if (
      !privateRevealed ||
      privateStrk === null
    ) {
      throw new Error(
        "Reveal your private STRK balance before starting Unshield Borrow.",
      );
    }

    if (
      privateStrk <
      units
    ) {
      throw new Error(
        "Private STRK balance is below the requested Borrow collateral.",
      );
    }

    setBusy(true);
    setError(null);

    try {
      const result =
        await submit(
          label,
          [
            {
              type:
                "withdraw",
              token:
                felt(
                  STRK_TOKEN,
                ),
              amount:
                num.toHex(
                  units,
                ),
              recipient:
                felt(
                  account.address,
                ),
            },
          ],
          false,
        );

      // Any previously disclosed private snapshot is stale after spending it.
      setPrivateStrk(null);
      setPrivateXstrk(null);
      setPrivateRevealed(false);

      setBalances(
        (current) =>
          clearBalancesByVisibility(
            current,
            "private",
          ),
      );

      return result;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Unshield Borrow collateral failed.";

      setError(message);

      throw new Error(
        message,
      );
    } finally {
      setBusy(false);
    }
  };

  const executeSwap = async (
    quote: Quote,
    expectedSellToken: string,
    expectedBuyToken: string,
    label: string,
  ): Promise<string> => {
    if (swapSubmitting.current || busy || !walletAccount) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const account = walletAccount;
    const routeNetwork = getCarelNetwork(chainId);

    if (!routeNetwork) {
      throw new Error(
        "CAREL supports Starknet Sepolia and Starknet Mainnet.",
      );
    }

    const assertSession = async () => {
      const selected =
        account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

      const [network, accounts] = await Promise.all([
        walletV6.requestChainId(selected),
        account.requestAccounts(true),
      ]);

      if (
        currentAccount.current !== account ||
        String(network) !== routeNetwork.chainId ||
        !accounts[0] ||
        felt(accounts[0]) !== felt(account.address)
      ) {
        throw new Error(
          "Wallet account or network changed. Reconnect Ready on the intended Starknet network.",
        );
      }
    };

    if (quote.chainId !== routeNetwork.chainId) {
      throw new Error(
        `The AVNU quote is not for ${routeNetwork.label}.`,
      );
    }

    if (
      felt(quote.sellTokenAddress) !== felt(expectedSellToken) ||
      felt(quote.buyTokenAddress) !== felt(expectedBuyToken)
    ) {
      throw new Error(
        "The AVNU quote does not match the reviewed token pair.",
      );
    }

    swapSubmitting.current = true;
    setBusy(true);
    setError(null);

    try {
      await assertSession();

      let built;

      try {
        built = await quoteToCalls(
          {
            quoteId: quote.quoteId,
            takerAddress: account.address,
            slippage: 0.005,
            executeApprove: true,
          },
          {
            baseUrl: routeNetwork.avnuBaseUrl,
          },
        );
      } catch (cause) {
        throw new Error(
          `AVNU build failed: ${
            cause instanceof Error
              ? cause.message
              : "Could not build swap calls."
          }`,
        );
      }

      if (built.chainId !== routeNetwork.chainId) {
        throw new Error(
          "AVNU built the swap for the wrong Starknet network.",
        );
      }

      if (!built.calls.length) {
        throw new Error(
          "AVNU returned an empty swap transaction.",
        );
      }

      const safeCalls = validateAvnuBuiltCalls(
        built.calls,
        expectedSellToken,
        quote.sellAmount,
        routeNetwork.avnuExchange,
      );

      // Re-check wallet immediately before asking Ready to sign.
      await assertSession();

      let response;

      try {
        response = await account.execute(safeCalls);
      } catch (cause) {
        throw new Error(
          `Ready execution failed: ${
            cause instanceof Error
              ? cause.message
              : "Wallet execution failed."
          }`,
        );
      }

      const hash = response.transaction_hash;

      if (!/^0x[0-9a-f]{1,64}$/i.test(hash)) {
        throw new Error(
          "Ready did not return a valid swap transaction hash.",
        );
      }

      setTx({
        kind: "pending",
        label,
        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          routeNetwork.provider,
        );
        setTx({
          kind: "confirmed",
          label,
          hash,
        });
      } catch {
        setTx({
          kind: "submitted",
          label,
          hash,
        });
      }

      await refreshPublicBalance();

      return hash;
    } finally {
      swapSubmitting.current = false;
      setBusy(false);
    }
  };

  const executeShieldSwap = async (
    quote: Quote,
    expectedSellToken: string,
    expectedBuyToken: string,
    label: string,
  ): Promise<string> => {
    if (swapSubmitting.current || busy || !walletAccount) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const { account, network } = assertPrivateReady();

    if (quote.chainId !== network.chainId) {
      throw new Error(
        `The AVNU quote is not for ${network.label}.`,
      );
    }

    if (
      felt(quote.sellTokenAddress) !== felt(expectedSellToken) ||
      felt(quote.buyTokenAddress) !== felt(expectedBuyToken)
    ) {
      throw new Error(
        "The AVNU quote does not match the reviewed Shield Swap pair.",
      );
    }

    if (quote.sellAmount <= 0n) {
      throw new Error("Shield Swap amount must be greater than zero.");
    }

    // STRK20 Wallet API validates ADDRESS/FELT values strictly.
    // Normalize every address to minimal canonical hex before sending
    // the private action payload to Ready.
    const sellToken = felt(expectedSellToken);
    const buyToken = felt(expectedBuyToken);
    const ownerAddress = felt(account.address);

    const assertSession = async () => {
      const selected =
        account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

      const [walletChain, accounts] = await Promise.all([
        walletV6.requestChainId(selected),
        account.requestAccounts(true),
      ]);

      if (
        currentAccount.current !== account ||
        String(walletChain) !== network.chainId ||
        !accounts[0] ||
        felt(accounts[0]) !== felt(account.address)
      ) {
        throw new Error(
          "Wallet account or network changed. Reconnect Ready before continuing.",
        );
      }
    };

    swapSubmitting.current = true;
    setBusy(true);
    setError(null);

    try {
      await assertSession();

      let built;

      try {
        built = await quoteToCalls(
          {
            quoteId: quote.quoteId,
            slippage: 0.005,
            private: true,
          },
          {
            baseUrl: network.avnuBaseUrl,
          },
        );
      } catch (cause) {
        throw new Error(
          `AVNU private build failed: ${
            cause instanceof Error
              ? cause.message
              : "Could not build the private swap."
          }`,
        );
      }

      if (built.chainId !== network.chainId) {
        throw new Error(
          "AVNU built the private swap for the wrong network.",
        );
      }

      if (!built.executorAddress) {
        throw new Error(
          "AVNU did not return a private swap executor.",
        );
      }

      const executorAddress = felt(
        built.executorAddress,
      );

      if (!built.calls.length) {
        throw new Error(
          "AVNU returned an empty private swap route.",
        );
      }

      const safePrivateCalls = validateAvnuBuiltCalls(
        built.calls,
        expectedSellToken,
        quote.sellAmount,
        network.avnuExchange,
      );

      const serializedCalls =
        transaction
          .fromCallsToExecuteCalldata_cairo1(safePrivateCalls)
          .map((value) => num.toHex(value));

      const actions: WALLET_API.STRK20_ACTION[] = [
        {
          type: "deposit",
          token: sellToken,
          amount: num.toHex(quote.sellAmount),
        },
        {
          type: "withdraw",
          token: sellToken,
          amount: num.toHex(quote.sellAmount),
          recipient: executorAddress,
        },
        {
          type: "transfer",
          token: buyToken,
          amount: "OPEN",
          recipient: ownerAddress,
        },
        {
          type: "invoke",
          contract: executorAddress,
          calldata: [
            buyToken,
            ...serializedCalls,
            "${openNoteIds[0]}",
          ],
        },
      ];

      // Re-check immediately before Ready starts proof generation.
      await assertSession();

      let response;

      try {
        response =
          await account.strk20InvokeTransaction(actions);
      } catch (cause) {
        throw new Error(
          `Ready Shield Swap failed: ${
            cause instanceof Error
              ? cause.message
              : "Private wallet execution failed."
          }`,
        );
      }

      const hash = response.transaction_hash;

      if (!/^0x[0-9a-f]{1,64}$/i.test(hash)) {
        throw new Error(
          "Ready did not return a valid Shield Swap transaction hash.",
        );
      }

      setTx({
        kind: "pending",
        label,
        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind: "confirmed",
          label,
          hash,
        });

        const block = Number(
          await network.provider.getBlockNumber(),
        );

        setCurrentBlock(block);
        setMaturityTarget(block + 10);
      } catch {
        setTx({
          kind: "submitted",
          label,
          hash,
        });
      }

      await refreshPublicBalance();

      return hash;
    } finally {
      swapSubmitting.current = false;
      setBusy(false);
    }
  };

  const executeUnshieldSwapStart = async (
    quote: Quote,
    expectedSellToken: string,
    expectedBuyToken: string,
    label: string,
  ): Promise<{
    hash: string;
    privateBuyBefore: bigint;
    maturityTarget: number;
  }> => {
    if (swapSubmitting.current || busy || !walletAccount) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const { account, network } = assertPrivateReady();

    if (quote.chainId !== network.chainId) {
      throw new Error(
        `The AVNU quote is not for ${network.label}.`,
      );
    }

    if (
      felt(quote.sellTokenAddress) !== felt(expectedSellToken) ||
      felt(quote.buyTokenAddress) !== felt(expectedBuyToken)
    ) {
      throw new Error(
        "The AVNU quote does not match the reviewed Unshield Swap pair.",
      );
    }

    const sellToken = felt(expectedSellToken);
    const buyToken = felt(expectedBuyToken);
    const ownerAddress = felt(account.address);

    const assertSession = async () => {
      const selected =
        account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

      const [walletChain, accounts] = await Promise.all([
        walletV6.requestChainId(selected),
        account.requestAccounts(true),
      ]);

      if (
        currentAccount.current !== account ||
        String(walletChain) !== network.chainId ||
        !accounts[0] ||
        felt(accounts[0]) !== felt(account.address)
      ) {
        throw new Error(
          "Wallet account or network changed. Reconnect Ready before continuing.",
        );
      }
    };

    swapSubmitting.current = true;
    setBusy(true);
    setError(null);

    try {
      await assertSession();

      // Snapshot private USDC before the swap so CAREL can later
      // withdraw exactly the newly received private output.
      const beforeResult =
        await account.strk20Balances([buyToken]);

      const privateBuyBefore =
        readStrk20TokenAmount(
          beforeResult,
          buyToken,
        );

      const built = await quoteToCalls(
        {
          quoteId: quote.quoteId,
          slippage: 0.005,
          private: true,
        },
        {
          baseUrl: network.avnuBaseUrl,
        },
      );

      if (
        built.chainId !== network.chainId ||
        !built.executorAddress ||
        !built.calls.length
      ) {
        throw new Error(
          "AVNU returned an invalid private swap route.",
        );
      }

      const executorAddress =
        felt(built.executorAddress);

      const safePrivateCalls = validateAvnuBuiltCalls(
        built.calls,
        expectedSellToken,
        quote.sellAmount,
        network.avnuExchange,
      );

      const serializedCalls =
        transaction
          .fromCallsToExecuteCalldata_cairo1(
            safePrivateCalls,
          )
          .map((value) => num.toHex(value));

      const actions: WALLET_API.STRK20_ACTION[] = [
        {
          type: "withdraw",
          token: sellToken,
          amount: num.toHex(quote.sellAmount),
          recipient: executorAddress,
        },
        {
          type: "transfer",
          token: buyToken,
          amount: "OPEN",
          recipient: ownerAddress,
        },
        {
          type: "invoke",
          contract: executorAddress,
          calldata: [
            buyToken,
            ...serializedCalls,
            "${openNoteIds[0]}",
          ],
        },
      ];

      await assertSession();

      const response =
        await account.strk20InvokeTransaction(actions);

      const hash = response.transaction_hash;

      if (!/^0x[0-9a-f]{1,64}$/i.test(hash)) {
        throw new Error(
          "Ready did not return a valid private swap transaction hash.",
        );
      }

      setTx({
        kind: "pending",
        label,
        hash,
      });

      await waitForSubmittedTransaction(
        hash,
        network.provider,
      );

      setTx({
        kind: "confirmed",
        label,
        hash,
      });

      const block = Number(
        await network.provider.getBlockNumber(),
      );

      const target = block + 10;

      setCurrentBlock(block);
      setMaturityTarget(target);

      // The private xSTRK and STRK observations
      // are stale after the private swap.
      setPrivateStrk(null);
      setPrivateXstrk(null);
      setPrivateRevealed(false);
      setBalances(
        (current) =>
          clearBalancesByVisibility(
            current,
            "private",
          ),
      );

      return {
        hash,
        privateBuyBefore,
        maturityTarget: target,
      };
    } finally {
      swapSubmitting.current = false;
      setBusy(false);
    }
  };

  const completeUnshieldSwap = async (
    token: string,
    privateBuyBefore: bigint,
    minExpected: bigint,
    targetBlock: number,
    label: string,
  ): Promise<{
    hash: string;
    amount: bigint;
  }> => {
    if (swapSubmitting.current || busy || !walletAccount) {
      throw new Error(
        "Finish the current wallet request first.",
      );
    }

    const { account, network } = assertPrivateReady();
    const normalizedToken = felt(token);
    const ownerAddress = felt(account.address);

    const assertSession = async () => {
      const selected =
        account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

      const [walletChain, accounts] = await Promise.all([
        walletV6.requestChainId(selected),
        account.requestAccounts(true),
      ]);

      if (
        currentAccount.current !== account ||
        String(walletChain) !== network.chainId ||
        !accounts[0] ||
        felt(accounts[0]) !== ownerAddress
      ) {
        throw new Error(
          "Wallet account or network changed. Reconnect Ready before completing Unshield.",
        );
      }
    };

    swapSubmitting.current = true;
    setBusy(true);
    setError(null);

    try {
      await assertSession();

      const current = Number(
        await network.provider.getBlockNumber(),
      );

      if (current < targetBlock) {
        throw new Error(
          `Private output is still maturing. Wait until block ${targetBlock.toLocaleString()}.`,
        );
      }

      const balanceResult =
        await account.strk20Balances([
          normalizedToken,
        ]);

      const privateBuyAfter =
        readStrk20TokenAmount(
          balanceResult,
          normalizedToken,
        );

      const received =
        privateBuyAfter - privateBuyBefore;

      if (received <= 0n) {
        throw new Error(
          "No new private output was found.",
        );
      }

      if (received < minExpected) {
        throw new Error(
          "Private output is below the reviewed minimum. Do not withdraw automatically.",
        );
      }

      // Do not expose unrelated private output that may have arrived
      // during the maturity window. Only the reviewed minimum amount
      // is moved back to the public wallet.
      const withdrawAmount = minExpected;

      await assertSession();

      const response =
        await account.strk20InvokeTransaction([
          {
            type: "withdraw",
            token: normalizedToken,
            amount: num.toHex(withdrawAmount),
            recipient: ownerAddress,
          },
        ]);

      const hash = response.transaction_hash;

      if (!/^0x[0-9a-f]{1,64}$/i.test(hash)) {
        throw new Error(
          "Ready did not return a valid Unshield transaction hash.",
        );
      }

      setTx({
        kind: "pending",
        label,
        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind: "confirmed",
          label,
          hash,
        });
      } catch {
        setTx({
          kind: "submitted",
          label,
          hash,
        });
      }

      setMaturityTarget(null);
      setPrivateStrk(null);
      setPrivateXstrk(null);
      setPrivateRevealed(false);
      setBalances(
        (current) =>
          clearBalancesByVisibility(
            current,
            "private",
          ),
      );

      return {
        hash,
        amount: withdrawAmount,
      };
    } finally {
      swapSubmitting.current = false;
      setBusy(false);
    }
  };

  const executeStakingAction = async (
    action: StakingAction,
    amount: string | null,
    poolAddress: string,
    tokenAddress: string,
    label: string,
  ): Promise<string> => {
    if (
      stakingSubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const account =
      walletAccount;

    const network =
      getCarelNetwork(
        chainId,
      );

    if (
      !network ||
      network.id !== "mainnet"
    ) {
      throw new Error(
        "CAREL Staking is currently enabled on Starknet Mainnet only.",
      );
    }

    if (
      felt(tokenAddress) !==
      felt(STRK_TOKEN)
    ) {
      throw new Error(
        "CAREL only supports STRK staking in this route.",
      );
    }

    const parsedAmount =
      amount === null
        ? null
        : parseUnits18(amount);

    if (
      (
        action === "stake" ||
        action ===
          "initiateUnstake"
      ) &&
      (
        parsedAmount === null ||
        parsedAmount <= 0n
      )
    ) {
      throw new Error(
        "Staking amount must be greater than zero.",
      );
    }

    if (
      parsedAmount !== null &&
      parsedAmount >=
        (1n << 128n)
    ) {
      throw new Error(
        "Staking amount exceeds the supported staking range.",
      );
    }

    const pool =
      felt(poolAddress);

    const token =
      felt(tokenAddress);

    const owner =
      felt(account.address);

    const assertSession =
      async () => {
        const selected =
          account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

        const [
          walletChain,
          accounts,
        ] =
          await Promise.all([
            walletV6.requestChainId(
              selected,
            ),
            account.requestAccounts(
              true,
            ),
          ]);

        if (
          currentAccount.current !==
            account ||
          String(walletChain) !==
            network.chainId ||
          !accounts[0] ||
          felt(accounts[0]) !==
            owner
        ) {
          throw new Error(
            "Wallet account or network changed. Reconnect Ready on Starknet Mainnet.",
          );
        }
      };

    stakingSubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      await assertSession();

      if (
        action === "stake" &&
        parsedAmount !== null &&
        publicStrk !== null &&
        publicStrk < parsedAmount
      ) {
        throw new Error(
          "Insufficient public STRK balance for this stake.",
        );
      }

      const response =
        await fetch(
          "/api/staking",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                action,
                owner:
                  account.address,
                poolAddress:
                  pool,
                ...(parsedAmount !==
                null
                  ? {
                      amount:
                        parsedAmount.toString(),
                    }
                  : {}),
              }),
          },
        );

      const raw: unknown =
        await response.json();

      if (
        !raw ||
        typeof raw !== "object"
      ) {
        throw new Error(
          "CAREL staking API returned an invalid response.",
        );
      }

      const result =
        raw as Record<
          string,
          unknown
        >;

      if (!response.ok) {
        throw new Error(
          typeof result.error ===
            "string"
            ? result.error
            : "Could not build staking calls.",
        );
      }

      if (
        result.action !==
          action ||
        typeof result.chainId !==
          "string" ||
        !Array.isArray(
          result.calls,
        ) ||
        typeof result.poolAddress !==
          "string" ||
        felt(
          result.poolAddress,
        ) !== pool
      ) {
        throw new Error(
          "CAREL staking API returned malformed or mismatched calls.",
        );
      }

      if (
        result.chainId !==
        network.chainId
      ) {
        throw new Error(
          "AVNU built staking calls for the wrong Starknet network.",
        );
      }

      const safeCalls =
        validateAvnuStakingCalls(
          result.calls as Call[],
          action,
          token,
          pool,
          owner,
          parsedAmount,
        );

      await assertSession();

      const walletResponse =
        await account.execute(
          safeCalls,
        );

      const hash =
        walletResponse.transaction_hash;

      if (
        !/^0x[0-9a-f]{1,64}$/i.test(
          hash,
        )
      ) {
        throw new Error(
          "Ready did not return a valid staking transaction hash.",
        );
      }

      setTx({
        kind: "pending",
        label,
        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind: "confirmed",
          label,
          hash,
        });
      } catch {
        setTx({
          kind: "submitted",
          label,
          hash,
        });
      }

      if (
        action === "stake" ||
        action ===
          "completeUnstake"
      ) {
        try {
          await refreshPublicBalance();
        } catch {
          // Position refresh remains available separately.
        }
      }

      return hash;
    } finally {
      stakingSubmitting.current =
        false;

      setBusy(false);
    }
  };

  const executeStaking = async (
    amount: string,
    poolAddress: string,
    tokenAddress: string,
    label: string,
  ) =>
    executeStakingAction(
      "stake",
      amount,
      poolAddress,
      tokenAddress,
      label,
    );

  const executeShieldStaking = async (
    amount: string,
    feeAmount: string,
    label: string,
  ): Promise<string> => {
    if (
      stakingSubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const {
      account,
      network,
    } = assertPrivateReady();

    if (
      network.id !== "mainnet"
    ) {
      throw new Error(
        "Shield Staking is currently enabled on Starknet Mainnet only.",
      );
    }

    const totalAmount =
      parseUnits18(amount);

    let privacyFee: bigint;

    try {
      if (
        !/^[1-9][0-9]*$/.test(
          feeAmount,
        )
      ) {
        throw new Error();
      }

      privacyFee =
        BigInt(feeAmount);
    } catch {
      throw new Error(
        "Invalid Endur privacy fee.",
      );
    }

    if (
      totalAmount <= 0n
    ) {
      throw new Error(
        "Shield Stake amount must be greater than zero.",
      );
    }

    if (
      totalAmount <=
      privacyFee
    ) {
      throw new Error(
        `Shield Stake amount must be greater than the privacy fee (${formatUnits18(
          privacyFee,
          4,
        )} STRK).`,
      );
    }

    if (
      publicStrk !== null &&
      publicStrk < totalAmount
    ) {
      throw new Error(
        "Insufficient public STRK balance for Shield Staking.",
      );
    }

    const stakedAmount =
      totalAmount -
      privacyFee;

    const inputToken =
      felt(STRK_TOKEN);

    const outputToken =
      felt(
        ENDUR_XSTRK_TOKEN,
      );

    const anonymizer =
      felt(
        ENDUR_DEPOSIT_ANONYMIZER,
      );

    const recipient =
      felt(account.address);

    const uint128Mask =
      (1n << 128n) - 1n;

    const amountLow =
      stakedAmount &
      uint128Mask;

    const amountHigh =
      stakedAmount >>
      128n;

    const assertSession =
      async () => {
        const selected =
          account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

        const [
          walletChain,
          accounts,
        ] =
          await Promise.all([
            walletV6.requestChainId(
              selected,
            ),
            account.requestAccounts(
              true,
            ),
          ]);

        if (
          currentAccount.current !==
            account ||
          String(walletChain) !==
            network.chainId ||
          !accounts[0] ||
          felt(accounts[0]) !==
            recipient
        ) {
          throw new Error(
            "Wallet account or network changed. Reconnect Ready on Starknet Mainnet.",
          );
        }
      };

    stakingSubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      await assertSession();

      const actions:
        WALLET_API.STRK20_ACTION[] =
        [
          // Public STRK -> privacy pool.
          {
            type: "deposit",
            token:
              inputToken,
            amount:
              num.toHex(
                totalAmount,
              ),
          },

          // Fund Endur anonymizer from
          // the private STRK balance.
          {
            type: "withdraw",
            token:
              inputToken,
            amount:
              num.toHex(
                stakedAmount,
              ),
            recipient:
              anonymizer,
          },

          // xSTRK output returns as a
          // new private/open note.
          {
            type: "transfer",
            token:
              outputToken,
            amount: "OPEN",
            recipient,
          },

          {
            type: "invoke",
            contract:
              anonymizer,
            calldata: [
              inputToken,
              outputToken,
              num.toHex(
                amountLow,
              ),
              num.toHex(
                amountHigh,
              ),
              "${openNoteIds[0]}",
            ],
          },
        ];

      await assertSession();

      let response;

      try {
        response =
          await account
            .strk20InvokeTransaction(
              actions,
            );
      } catch (cause) {
        throw new Error(
          `Ready Shield Staking failed: ${
            cause instanceof Error
              ? cause.message
              : "Private staking execution failed."
          }`,
        );
      }

      const hash =
        response.transaction_hash;

      if (
        !/^0x[0-9a-f]{1,64}$/i.test(
          hash,
        )
      ) {
        throw new Error(
          "Ready did not return a valid Shield Staking transaction hash.",
        );
      }

      setTx({
        kind: "pending",
        label,
        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind: "confirmed",
          label,
          hash,
        });

        const block =
          Number(
            await network.provider
              .getBlockNumber(),
          );

        setCurrentBlock(
          block,
        );

        setMaturityTarget(
          block + 10,
        );
      } catch {
        setTx({
          kind: "submitted",
          label,
          hash,
        });
      }

      // The old private STRK observation is
      // stale after this operation.
      setPrivateStrk(null);
      setPrivateXstrk(null);
      setPrivateRevealed(false);
      setBalances(
        (current) =>
          clearBalancesByVisibility(
            current,
            "private",
          ),
      );

      return hash;
    } finally {
      stakingSubmitting.current =
        false;

      setBusy(false);
    }
  };

  /**
   * Shield Lend:
   * public underlying -> STRK20 -> Vesu anonymizer -> private vToken note.
   *
   * The vToken is independently resolved again through Vesu PoolFactory
   * before Ready receives the private action sequence.
   */
  const executeShieldLend = async (
    payload: VesuShieldLendExecutionPayload,
    label: string,
  ): Promise<PrivateTransferResult> => {
    if (
      lendSubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const {
      account,
      network,
    } = assertPrivateReady();

    if (
      network.id !==
        "mainnet"
    ) {
      throw new Error(
        "Shield Lend is enabled on Starknet Mainnet only.",
      );
    }

    if (
      payload.chainId !==
        network.chainId
    ) {
      throw new Error(
        "Prepared Shield Lend belongs to another network.",
      );
    }

    if (
      !Number.isFinite(
        payload.preparedAt,
      ) ||
      !Number.isFinite(
        payload.expiresAt,
      ) ||
      payload.expiresAt <=
        payload.preparedAt ||
      Date.now() >
        payload.expiresAt
    ) {
      throw new Error(
        "Shield Lend review expired. Review the Vesu market again.",
      );
    }

    const anonymizer =
      configuredVesuLendingAnonymizer();

    if (!anonymizer) {
      throw new Error(
        "No verified Vesu Lending Anonymizer is configured for Mainnet.",
      );
    }

    if (
      felt(
        anonymizer,
      ) !==
      felt(
        payload.anonymizerAddress,
      )
    ) {
      throw new Error(
        "Prepared Shield Lend references an unexpected anonymizer.",
      );
    }

    /*
     * Independent wallet-side verification.
     * Even a compromised preparation endpoint cannot substitute another
     * contract at the configured anonymizer address.
     */
    const anonymizerClassHash =
      await network.provider
        .getClassHashAt(
          anonymizer,
        );

    if (
      BigInt(
        anonymizerClassHash,
      ) !==
      BigInt(
        VESU_LENDING_ANONYMIZER_CLASS_HASH,
      )
    ) {
      throw new Error(
        "Vesu Lending Anonymizer failed wallet-side class-hash verification.",
      );
    }

    const pool =
      getVesuPool(
        payload.poolId,
      );

    if (
      !pool ||
      felt(
        pool.address,
      ) !==
      felt(
        payload.poolAddress,
      )
    ) {
      throw new Error(
        "Prepared Shield Lend references an unapproved Vesu pool.",
      );
    }

    if (
      felt(
        payload.owner,
      ) !==
      felt(
        account.address,
      )
    ) {
      throw new Error(
        "Prepared Shield Lend belongs to another wallet.",
      );
    }

    const asset =
      network.assetList.find(
        (candidate) =>
          candidate.id ===
          payload.assetId,
      );

    if (!asset) {
      throw new Error(
        "Prepared Shield Lend references an unsupported asset.",
      );
    }

    const assetAddress =
      requireStarknetBalanceAddress(
        asset,
      );

    if (
      felt(
        assetAddress,
      ) !==
      felt(
        payload.assetAddress,
      )
    ) {
      throw new Error(
        "Shield Lend underlying does not match CAREL's asset registry.",
      );
    }

    let amount: bigint;

    try {
      amount =
        BigInt(
          payload.amount,
        );
    } catch {
      throw new Error(
        "Prepared Shield Lend contains an invalid amount.",
      );
    }

    if (
      amount <= 0n
    ) {
      throw new Error(
        "Shield Lend amount must be greater than zero.",
      );
    }

    const knownPublic =
      findAssetBalance(
        balances,
        asset.id,
        "public",
      )?.amount;

    if (
      knownPublic !== null &&
      knownPublic !== undefined &&
      knownPublic < amount
    ) {
      throw new Error(
        `Insufficient public ${asset.symbol} balance for Shield Lend.`,
      );
    }

    /*
     * Re-resolve vToken directly from upstream Vesu state.
     */
    const resolved =
      await network.provider
        .callContract({
          contractAddress:
            VESU_MAINNET_POOL_FACTORY,

          entrypoint:
            "v_token_for_asset",

          calldata: [
            pool.address,
            assetAddress,
          ],
        });

    if (
      !resolved[0] ||
      felt(
        resolved[0],
      ) !==
      felt(
        payload.vTokenAddress,
      )
    ) {
      throw new Error(
        "Prepared vToken does not match Vesu PoolFactory.",
      );
    }

    /*
     * The vault itself must also report the reviewed underlying.
     */
    const underlying =
      await network.provider
        .callContract({
          contractAddress:
            payload.vTokenAddress,

          entrypoint:
            "asset",

          calldata: [],
        });

    if (
      !underlying[0] ||
      felt(
        underlying[0],
      ) !==
      felt(
        assetAddress,
      )
    ) {
      throw new Error(
        "Vesu vToken underlying does not match the reviewed asset.",
      );
    }

    const actions =
      buildVesuShieldLendActions({
        assetAddress,

        vTokenAddress:
          payload.vTokenAddress,

        anonymizerAddress:
          anonymizer,

        owner:
          account.address,

        amount,
      });

    lendSubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      if (
        Date.now() >
        payload.expiresAt
      ) {
        throw new Error(
          "Shield Lend review expired before signing.",
        );
      }

      const result =
        await submit(
          label,
          actions,
          true,
        );

      /*
       * The new private vToken note changes private state.
       * Require a fresh disclosure afterwards.
       */
      setPrivateStrk(null);
      setPrivateXstrk(null);
      setPrivateRevealed(false);

      setBalances(
        (current) =>
          clearBalancesByVisibility(
            current,
            "private",
          ),
      );

      return result;
    } finally {
      lendSubmitting.current =
        false;

      setBusy(false);
    }
  };


  /**
   * Executes a server-prepared public Vesu Lend after independently
   * rebuilding and validating every wallet call.
   */
  const executeLend = async (
    payload: VesuLendExecutionPayload,
    label: string,
  ): Promise<string> => {
    if (
      lendSubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const account =
      walletAccount;

    const network =
      getCarelNetwork(
        chainId,
      );

    if (
      !network ||
      network.id !==
        "mainnet"
    ) {
      throw new Error(
        "CAREL Lend is currently enabled on Starknet Mainnet only.",
      );
    }

    if (
      payload.chainId !==
        network.chainId
    ) {
      throw new Error(
        "Prepared Lend belongs to another Starknet network.",
      );
    }

    if (
      !Number.isFinite(
        payload.preparedAt,
      ) ||
      !Number.isFinite(
        payload.expiresAt,
      ) ||
      payload.expiresAt <=
        payload.preparedAt ||
      Date.now() >
        payload.expiresAt
    ) {
      throw new Error(
        "Lend review expired. Refresh the market and review again.",
      );
    }

    const pool =
      getVesuPool(
        payload.poolId,
      );

    if (
      !pool ||
      felt(pool.address) !==
        felt(
          payload.poolAddress,
        )
    ) {
      throw new Error(
        "Prepared Lend references an unapproved Vesu pool.",
      );
    }

    const owner =
      felt(
        account.address,
      );

    if (
      felt(payload.owner) !==
        owner
    ) {
      throw new Error(
        "Prepared Lend belongs to another account.",
      );
    }

    const pair =
      getVesuLendPair(
        payload.assetId,
        payload.counterpartAssetId,
      );

    if (!pair) {
      throw new Error(
        "Prepared Lend references a CAREL-disabled Vesu market.",
      );
    }

    let lendAmount:
      bigint;

    try {
      lendAmount =
        BigInt(
          payload.amount,
        );
    } catch {
      throw new Error(
        "Prepared Lend contains an invalid amount.",
      );
    }

    if (
      lendAmount <= 0n
    ) {
      throw new Error(
        "Prepared Lend amount must be greater than zero.",
      );
    }

    const market:
      VesuBorrowMarket = {
        id:
          `vesu:${pool.id}:${pair.asset.symbol}:${pair.counterpart.symbol}`,

        chainId:
          network.chainId,

        poolAddress:
          pool.address,

        collateralAsset:
          pair.asset,

        debtAsset:
          pair.counterpart,
      };

    const intent:
      VesuLendIntent = {
        assetId:
          pair.asset.id,

        amount:
          lendAmount,

        privacy:
          "public",
      };

    /*
     * Do not trust the prepared vToken address by itself.
     * Re-resolve it directly from Vesu before wallet execution.
     */
    const assetAddress =
      requireStarknetBalanceAddress(
        pair.asset,
      );

    const resolvedVToken =
      await network.provider
        .callContract({
          contractAddress:
            VESU_MAINNET_POOL_FACTORY,

          entrypoint:
            "v_token_for_asset",

          calldata: [
            pool.address,
            assetAddress,
          ],
        });

    if (
      !resolvedVToken[0] ||
      felt(
        resolvedVToken[0],
      ) !==
        felt(
          payload.vTokenAddress,
        )
    ) {
      throw new Error(
        "Prepared Lend vToken does not match Vesu PoolFactory.",
      );
    }

    const [
      vaultUnderlying,
      vaultPool,
    ] =
      await Promise.all([
        network.provider
          .callContract({
            contractAddress:
              payload.vTokenAddress,

            entrypoint:
              "asset",

            calldata: [],
          }),

        network.provider
          .callContract({
            contractAddress:
              payload.vTokenAddress,

            entrypoint:
              "pool_contract",

            calldata: [],
          }),
      ]);

    if (
      !vaultUnderlying[0] ||
      felt(
        vaultUnderlying[0],
      ) !==
        felt(
          assetAddress,
        )
    ) {
      throw new Error(
        "Vesu vToken underlying changed after review.",
      );
    }

    if (
      !vaultPool[0] ||
      felt(
        vaultPool[0],
      ) !==
        felt(
          pool.address,
        )
    ) {
      throw new Error(
        "Vesu vToken pool changed after review.",
      );
    }

    const safeCalls =
      validateVesuLendCalls({
        calls:
          payload.calls,

        market,

        owner,

        intent,

        vTokenAddress:
          payload.vTokenAddress,
      });

    const knownBalance =
      findAssetBalance(
        balances,
        pair.asset.id,
        "public",
      )?.amount;

    if (
      knownBalance !==
        null &&
      knownBalance !==
        undefined &&
      knownBalance <
        lendAmount
    ) {
      throw new Error(
        `Insufficient public ${pair.asset.symbol} balance for this Lend.`,
      );
    }

    const assertSession =
      async () => {
        const selected =
          account
            .walletProvider as unknown as
            WalletWithStarknetFeaturesV6;

        const [
          walletChain,
          accounts,
        ] =
          await Promise.all([
            walletV6
              .requestChainId(
                selected,
              ),

            account
              .requestAccounts(
                true,
              ),
          ]);

        if (
          currentAccount.current !==
            account ||
          String(walletChain) !==
            network.chainId ||
          !accounts[0] ||
          felt(accounts[0]) !==
            owner
        ) {
          throw new Error(
            "Wallet account or network changed. Reconnect Ready on Starknet Mainnet.",
          );
        }
      };

    lendSubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      await assertSession();

      if (
        Date.now() >
        payload.expiresAt
      ) {
        throw new Error(
          "Lend review expired before signing. Refresh and review again.",
        );
      }

      const response =
        await account.execute(
          safeCalls,
        );

      const hash =
        response.transaction_hash;

      if (
        !/^0x[0-9a-f]{1,64}$/i.test(
          hash,
        )
      ) {
        throw new Error(
          "Ready did not return a valid Lend transaction hash.",
        );
      }

      setTx({
        kind:
          "pending",
        label,
        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind:
            "confirmed",
          label,
          hash,
        });
      } catch {
        setTx({
          kind:
            "submitted",
          label,
          hash,
        });
      }

      try {
        await refreshAssetBalances();
      } catch {
        // Portfolio remains manually refreshable.
      }

      return hash;
    } finally {
      lendSubmitting.current =
        false;

      setBusy(false);
    }
  };

  /**
   * Executes a server-prepared public Vesu Borrow only after rebuilding
   * and validating the complete transaction locally.
   */
  const executeBorrow = async (
    payload: VesuBorrowExecutionPayload,
    label: string,
  ): Promise<string> => {
    if (
      borrowSubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const account =
      walletAccount;

    const network =
      getCarelNetwork(
        chainId,
      );

    if (
      !network ||
      network.id !== "mainnet"
    ) {
      throw new Error(
        "CAREL Borrow is currently enabled on Starknet Mainnet only.",
      );
    }

    if (
      payload.chainId !==
      network.chainId
    ) {
      throw new Error(
        "Prepared Borrow belongs to another Starknet network.",
      );
    }

    if (
      !Number.isFinite(
        payload.preparedAt,
      ) ||
      !Number.isFinite(
        payload.expiresAt,
      ) ||
      payload.expiresAt <=
        payload.preparedAt ||
      Date.now() >
        payload.expiresAt
    ) {
      throw new Error(
        "Borrow review expired. Refresh the market and review it again.",
      );
    }

    const pool =
      getVesuPool(
        payload.poolId,
      );

    if (
      !pool ||
      felt(pool.address) !==
        felt(payload.poolAddress)
    ) {
      throw new Error(
        "Prepared Borrow references an unapproved Vesu pool.",
      );
    }

    const owner =
      felt(
        account.address,
      );

    if (
      felt(payload.owner) !==
      owner
    ) {
      throw new Error(
        "Prepared Borrow belongs to another account.",
      );
    }

    const pair =
      getVesuBorrowPair(
        payload.collateralAssetId,
        payload.debtAssetId,
      );

    if (!pair) {
      throw new Error(
        "Prepared Vesu execution references a CAREL-disabled asset pair.",
      );
    }

    let collateralAmount:
      bigint;

    let borrowAmount:
      bigint;

    try {
      collateralAmount =
        BigInt(
          payload.collateralAmount,
        );

      borrowAmount =
        BigInt(
          payload.borrowAmount,
        );
    } catch {
      throw new Error(
        "Prepared Borrow contains invalid amounts.",
      );
    }

    if (
      collateralAmount <= 0n ||
      borrowAmount <= 0n
    ) {
      throw new Error(
        "Prepared Borrow amounts must be greater than zero.",
      );
    }

    const market:
      VesuBorrowMarket = {
        id:
          `vesu:${pool.id}:${pair.collateralAsset.symbol}:${pair.debtAsset.symbol}`,
        chainId:
          network.chainId,
        poolAddress:
          pool.address,
        collateralAsset:
          pair.collateralAsset,
        debtAsset:
          pair.debtAsset,
      };

    const intent:
      BorrowIntent = {
        action:
          "borrow",
        collateralAssetId:
          pair.collateralAsset.id,
        borrowAssetId:
          pair.debtAsset.id,
        collateralAmount,
        borrowAmount,
        privacy:
          "public",
      };

    const safeCalls =
      validateVesuBorrowCalls({
        calls:
          payload.calls,
        market,
        owner,
        intent,
      });

    const knownCollateral =
      findAssetBalance(
        balances,
        network.assets.strk.id,
        "public",
      )?.amount;

    if (
      knownCollateral !==
        null &&
      knownCollateral !==
        undefined &&
      knownCollateral <
        collateralAmount
    ) {
      throw new Error(
        "Insufficient public STRK balance for this Borrow collateral.",
      );
    }

    /**
     * Re-checks account and chain immediately before signing.
     */
    const assertSession =
      async () => {
        const selected =
          account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

        const [
          walletChain,
          accounts,
        ] =
          await Promise.all([
            walletV6.requestChainId(
              selected,
            ),
            account.requestAccounts(
              true,
            ),
          ]);

        if (
          currentAccount.current !==
            account ||
          String(walletChain) !==
            network.chainId ||
          !accounts[0] ||
          felt(accounts[0]) !==
            owner
        ) {
          throw new Error(
            "Wallet account or network changed. Reconnect Ready on Starknet Mainnet.",
          );
        }
      };

    borrowSubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      await assertSession();

      if (
        Date.now() >
        payload.expiresAt
      ) {
        throw new Error(
          "Borrow review expired before signing. Refresh and review again.",
        );
      }

      await assertSession();

      const response =
        await account.execute(
          safeCalls,
        );

      const hash =
        response.transaction_hash;

      if (
        !/^0x[0-9a-f]{1,64}$/i.test(
          hash,
        )
      ) {
        throw new Error(
          "Ready did not return a valid Borrow transaction hash.",
        );
      }

      setTx({
        kind:
          "pending",
        label,
        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind:
            "confirmed",
          label,
          hash,
        });
      } catch {
        setTx({
          kind:
            "submitted",
          label,
          hash,
        });
      }

      try {
        await refreshPublicBalance();
      } catch {
        // Public balances remain refreshable from Portfolio.
      }

      return hash;
    } finally {
      borrowSubmitting.current =
        false;

      setBusy(false);
    }
  };

  /**
   * Executes a server-prepared partial Vesu Repay after independently
   * rebuilding and validating every wallet call.
   */
  const executeRepay = async (
    payload: VesuRepayExecutionPayload,
    label: string,
  ): Promise<string> => {
    if (
      repaySubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const account =
      walletAccount;

    const network =
      getCarelNetwork(
        chainId,
      );

    if (
      !network ||
      network.id !==
        "mainnet"
    ) {
      throw new Error(
        "CAREL Repay is currently enabled on Starknet Mainnet only.",
      );
    }

    if (
      payload.chainId !==
      network.chainId
    ) {
      throw new Error(
        "Prepared Repay belongs to another Starknet network.",
      );
    }

    if (
      !Number.isFinite(
        payload.preparedAt,
      ) ||
      !Number.isFinite(
        payload.expiresAt,
      ) ||
      payload.expiresAt <=
        payload.preparedAt ||
      Date.now() >
        payload.expiresAt
    ) {
      throw new Error(
        "Repay review expired. Refresh the position and review it again.",
      );
    }

    const pool =
      getVesuPool(
        payload.poolId,
      );

    if (
      !pool ||
      felt(pool.address) !==
        felt(payload.poolAddress)
    ) {
      throw new Error(
        "Prepared Repay references an unapproved Vesu pool.",
      );
    }

    const owner =
      felt(
        account.address,
      );

    if (
      felt(payload.owner) !==
      owner
    ) {
      throw new Error(
        "Prepared Repay belongs to another account.",
      );
    }

    const pair =
      getVesuBorrowPair(
        payload.collateralAssetId,
        payload.debtAssetId,
      );

    if (!pair) {
      throw new Error(
        "Prepared Vesu execution references a CAREL-disabled asset pair.",
      );
    }

    let repayAmount:
      bigint;

    try {
      repayAmount =
        BigInt(
          payload.repayAmount,
        );
    } catch {
      throw new Error(
        "Prepared Repay contains an invalid amount.",
      );
    }

    if (repayAmount <= 0n) {
      throw new Error(
        "Prepared Repay amount must be greater than zero.",
      );
    }

    const market:
      VesuBorrowMarket = {
        id:
          `vesu:${pool.id}:${pair.collateralAsset.symbol}:${pair.debtAsset.symbol}`,

        chainId:
          network.chainId,

        poolAddress:
          pool.address,

        collateralAsset:
          pair.collateralAsset,

        debtAsset:
          pair.debtAsset,
      };

    const intent:
      RepayIntent = {
        action:
          "repay",

        assetId:
          pair.debtAsset.id,

        amount:
          repayAmount,

        positionId:
          market.id,

        privacy:
          "public",
      };

    const safeCalls =
      validateVesuRepayCalls({
        calls:
          payload.calls,

        market,

        owner,

        intent,
      });

    const knownDebt =
      findAssetBalance(
        balances,
        pair.debtAsset.id,
        "public",
      )?.amount;

    if (
      knownDebt !== null &&
      knownDebt !== undefined &&
      knownDebt <
        repayAmount
    ) {
      throw new Error(
        `Insufficient public ${pair.debtAsset.symbol} balance for this Repay.`,
      );
    }

    /**
     * Confirms the same Ready account and Mainnet chain immediately
     * before signing the reconstructed Repay calls.
     */
    const assertSession =
      async () => {
        const selected =
          account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

        const [
          walletChain,
          accounts,
        ] =
          await Promise.all([
            walletV6.requestChainId(
              selected,
            ),

            account.requestAccounts(
              true,
            ),
          ]);

        if (
          currentAccount.current !==
            account ||
          String(walletChain) !==
            network.chainId ||
          !accounts[0] ||
          felt(accounts[0]) !==
            owner
        ) {
          throw new Error(
            "Wallet account or network changed. Reconnect Ready on Starknet Mainnet.",
          );
        }
      };

    repaySubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      await assertSession();

      if (
        Date.now() >
        payload.expiresAt
      ) {
        throw new Error(
          "Repay review expired before signing. Refresh and review again.",
        );
      }

      const response =
        await account.execute(
          safeCalls,
        );

      const hash =
        response.transaction_hash;

      if (
        !/^0x[0-9a-f]{1,64}$/i.test(
          hash,
        )
      ) {
        throw new Error(
          "Ready did not return a valid Repay transaction hash.",
        );
      }

      setTx({
        kind:
          "pending",

        label,

        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind:
            "confirmed",

          label,

          hash,
        });
      } catch {
        setTx({
          kind:
            "submitted",

          label,

          hash,
        });
      }

      try {
        await refreshPublicBalance();
      } catch {
        // Portfolio remains independently refreshable.
      }

      return hash;
    } finally {
      repaySubmitting.current =
        false;

      setBusy(false);
    }
  };

  /**
   * Executes a server-prepared Vesu collateral top-up after rebuilding
   * the exact STRK approval and position update locally.
   */
  const executeAddVesuCollateral = async (
    payload: VesuAddCollateralExecutionPayload,
    label: string,
  ): Promise<string> => {
    if (
      addVesuCollateralSubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const account =
      walletAccount;

    const network =
      getCarelNetwork(
        chainId,
      );

    if (
      !network ||
      network.id !==
        "mainnet"
    ) {
      throw new Error(
        "Vesu Add Collateral is enabled on Starknet Mainnet only.",
      );
    }

    if (
      payload.chainId !==
      network.chainId
    ) {
      throw new Error(
        "Prepared Add Collateral belongs to another network.",
      );
    }

    if (
      !Number.isFinite(
        payload.preparedAt,
      ) ||
      !Number.isFinite(
        payload.expiresAt,
      ) ||
      payload.expiresAt <=
        payload.preparedAt ||
      Date.now() >
        payload.expiresAt
    ) {
      throw new Error(
        "Add Collateral review expired. Review the position again.",
      );
    }

    const pool =
      getVesuPool(
        payload.poolId,
      );

    if (
      !pool ||
      felt(pool.address) !==
        felt(payload.poolAddress)
    ) {
      throw new Error(
        "Prepared Add Collateral references an unapproved Vesu pool.",
      );
    }

    const owner =
      felt(
        account.address,
      );

    if (
      felt(payload.owner) !==
      owner
    ) {
      throw new Error(
        "Prepared Add Collateral belongs to another account.",
      );
    }

    const pair =
      getVesuBorrowPair(
        payload.collateralAssetId,
        payload.debtAssetId,
      );

    if (!pair) {
      throw new Error(
        "Prepared Vesu execution references a CAREL-disabled asset pair.",
      );
    }

    let collateralAmount:
      bigint;

    try {
      collateralAmount =
        BigInt(
          payload.collateralAmount,
        );
    } catch {
      throw new Error(
        "Prepared Add Collateral contains an invalid amount.",
      );
    }

    if (
      collateralAmount <= 0n
    ) {
      throw new Error(
        "Collateral amount must be greater than zero.",
      );
    }

    const market:
      VesuBorrowMarket = {
        id:
          `vesu:${pool.id}:${pair.collateralAsset.symbol}:${pair.debtAsset.symbol}`,

        chainId:
          network.chainId,

        poolAddress:
          pool.address,

        collateralAsset:
          pair.collateralAsset,

        debtAsset:
          pair.debtAsset,
      };

    const intent:
      CollateralIntent = {
        action:
          "add-collateral",

        collateralAssetId:
          pair.collateralAsset.id,

        amount:
          collateralAmount,

        positionId:
          market.id,

        privacy:
          "public",
      };

    const safeCalls =
      validateVesuAddCollateralCalls({
        calls:
          payload.calls,

        market,

        owner,

        intent,
      });

    const knownStrk =
      findAssetBalance(
        balances,
        network.assets.strk.id,
        "public",
      )?.amount;

    if (
      knownStrk !== null &&
      knownStrk !== undefined &&
      knownStrk <
        collateralAmount
    ) {
      throw new Error(
        "Insufficient public STRK balance for this collateral top-up.",
      );
    }

    const assertSession =
      async () => {
        const selected =
          account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

        const [
          walletChain,
          accounts,
        ] =
          await Promise.all([
            walletV6.requestChainId(
              selected,
            ),

            account.requestAccounts(
              true,
            ),
          ]);

        if (
          currentAccount.current !==
            account ||
          String(walletChain) !==
            network.chainId ||
          !accounts[0] ||
          felt(accounts[0]) !==
            owner
        ) {
          throw new Error(
            "Wallet account or network changed. Reconnect Ready on Starknet Mainnet.",
          );
        }
      };

    addVesuCollateralSubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      await assertSession();

      if (
        Date.now() >
        payload.expiresAt
      ) {
        throw new Error(
          "Add Collateral review expired before signing.",
        );
      }

      const response =
        await account.execute(
          safeCalls,
        );

      const hash =
        response.transaction_hash;

      if (
        !/^0x[0-9a-f]{1,64}$/i.test(
          hash,
        )
      ) {
        throw new Error(
          "Ready did not return a valid Add Collateral transaction hash.",
        );
      }

      setTx({
        kind:
          "pending",

        label,

        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind:
            "confirmed",

          label,

          hash,
        });
      } catch {
        setTx({
          kind:
            "submitted",

          label,

          hash,
        });
      }

      try {
        await refreshPublicBalance();
      } catch {
        // Portfolio remains independently refreshable.
      }

      return hash;
    } finally {
      addVesuCollateralSubmitting.current =
        false;

      setBusy(false);
    }
  };

  /**
   * Executes a reviewed Vesu collateral withdrawal only after rebuilding
   * the exact modify_position call locally.
   */
  const executeWithdrawVesuCollateral = async (
    payload: VesuWithdrawCollateralExecutionPayload,
    label: string,
  ): Promise<string> => {
    if (
      withdrawVesuCollateralSubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const account =
      walletAccount;

    const network =
      getCarelNetwork(
        chainId,
      );

    if (
      !network ||
      network.id !==
        "mainnet"
    ) {
      throw new Error(
        "Vesu Withdraw Collateral is enabled on Starknet Mainnet only.",
      );
    }

    if (
      payload.chainId !==
      network.chainId
    ) {
      throw new Error(
        "Prepared Withdraw Collateral belongs to another network.",
      );
    }

    if (
      !Number.isFinite(
        payload.preparedAt,
      ) ||
      !Number.isFinite(
        payload.expiresAt,
      ) ||
      payload.expiresAt <=
        payload.preparedAt ||
      Date.now() >
        payload.expiresAt
    ) {
      throw new Error(
        "Withdraw Collateral review expired. Review the position again.",
      );
    }

    const pool =
      getVesuPool(
        payload.poolId,
      );

    if (
      !pool ||
      felt(pool.address) !==
        felt(payload.poolAddress)
    ) {
      throw new Error(
        "Prepared withdrawal references an unapproved Vesu pool.",
      );
    }

    const owner =
      felt(
        account.address,
      );

    if (
      felt(payload.owner) !==
      owner
    ) {
      throw new Error(
        "Prepared withdrawal belongs to another account.",
      );
    }

    const pair =
      getVesuBorrowPair(
        payload.collateralAssetId,
        payload.debtAssetId,
      );

    if (!pair) {
      throw new Error(
        "Prepared Vesu execution references a CAREL-disabled asset pair.",
      );
    }

    let collateralAmount:
      bigint;

    try {
      collateralAmount =
        BigInt(
          payload.collateralAmount,
        );
    } catch {
      throw new Error(
        "Prepared withdrawal contains an invalid amount.",
      );
    }

    if (
      collateralAmount <= 0n
    ) {
      throw new Error(
        "Withdrawal amount must be greater than zero.",
      );
    }

    const market:
      VesuBorrowMarket = {
        id:
          `vesu:${pool.id}:${pair.collateralAsset.symbol}:${pair.debtAsset.symbol}`,

        chainId:
          network.chainId,

        poolAddress:
          pool.address,

        collateralAsset:
          pair.collateralAsset,

        debtAsset:
          pair.debtAsset,
      };

    const intent:
      CollateralIntent = {
        action:
          "withdraw-collateral",

        collateralAssetId:
          pair.collateralAsset.id,

        amount:
          collateralAmount,

        positionId:
          market.id,

        privacy:
          "public",
      };

    const safeCalls =
      validateVesuWithdrawCollateralCalls({
        calls:
          payload.calls,

        market,

        owner,

        intent,
      });

    const assertSession =
      async () => {
        const selected =
          account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

        const [
          walletChain,
          accounts,
        ] =
          await Promise.all([
            walletV6.requestChainId(
              selected,
            ),

            account.requestAccounts(
              true,
            ),
          ]);

        if (
          currentAccount.current !==
            account ||
          String(walletChain) !==
            network.chainId ||
          !accounts[0] ||
          felt(accounts[0]) !==
            owner
        ) {
          throw new Error(
            "Wallet account or network changed. Reconnect Ready on Starknet Mainnet.",
          );
        }
      };

    withdrawVesuCollateralSubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      await assertSession();

      if (
        Date.now() >
        payload.expiresAt
      ) {
        throw new Error(
          "Withdraw Collateral review expired before signing.",
        );
      }

      const response =
        await account.execute(
          safeCalls,
        );

      const hash =
        response.transaction_hash;

      if (
        !/^0x[0-9a-f]{1,64}$/i.test(
          hash,
        )
      ) {
        throw new Error(
          "Ready did not return a valid Withdraw Collateral transaction hash.",
        );
      }

      setTx({
        kind:
          "pending",

        label,

        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind:
            "confirmed",

          label,

          hash,
        });
      } catch {
        setTx({
          kind:
            "submitted",

          label,

          hash,
        });
      }

      try {
        await refreshPublicBalance();
      } catch {
        // Portfolio remains independently refreshable.
      }

      return hash;
    } finally {
      withdrawVesuCollateralSubmitting.current =
        false;

      setBusy(false);
    }
  };

  /**
   * Executes a server-prepared full Vesu position close after rebuilding
   * all Native-denomination calldata locally.
   */
  const executeCloseVesuPosition = async (
    payload: VesuCloseExecutionPayload,
    label: string,
  ): Promise<string> => {
    if (
      closeVesuSubmitting.current ||
      busy ||
      !walletAccount
    ) {
      throw new Error(
        "Connect your wallet and finish the current wallet request first.",
      );
    }

    const account =
      walletAccount;

    const network =
      getCarelNetwork(
        chainId,
      );

    if (
      !network ||
      network.id !==
        "mainnet"
    ) {
      throw new Error(
        "Vesu Close Position is enabled on Starknet Mainnet only.",
      );
    }

    if (
      payload.chainId !==
      network.chainId
    ) {
      throw new Error(
        "Prepared Close Position belongs to another Starknet network.",
      );
    }

    if (
      !Number.isFinite(
        payload.preparedAt,
      ) ||
      !Number.isFinite(
        payload.expiresAt,
      ) ||
      payload.expiresAt <=
        payload.preparedAt ||
      Date.now() >
        payload.expiresAt
    ) {
      throw new Error(
        "Close Position review expired. Refresh the position and review it again.",
      );
    }

    const pool =
      getVesuPool(
        payload.poolId,
      );

    if (
      !pool ||
      felt(pool.address) !==
        felt(payload.poolAddress)
    ) {
      throw new Error(
        "Prepared Close Position references an unapproved Vesu pool.",
      );
    }

    const owner =
      felt(
        account.address,
      );

    if (
      felt(payload.owner) !==
      owner
    ) {
      throw new Error(
        "Prepared Close Position belongs to another account.",
      );
    }

    const pair =
      getVesuBorrowPair(
        payload.collateralAssetId,
        payload.debtAssetId,
      );

    if (!pair) {
      throw new Error(
        "Prepared Vesu execution references a CAREL-disabled asset pair.",
      );
    }

    let collateralShares:
      bigint;

    let nominalDebt:
      bigint;

    let debtSnapshot:
      bigint;

    let approvalCap:
      bigint;

    try {
      collateralShares =
        BigInt(
          payload.collateralShares,
        );

      nominalDebt =
        BigInt(
          payload.nominalDebt,
        );

      debtSnapshot =
        BigInt(
          payload.debtSnapshot,
        );

      approvalCap =
        BigInt(
          payload.approvalCap,
        );
    } catch {
      throw new Error(
        "Prepared Close Position contains invalid native position values.",
      );
    }

    if (
      collateralShares <= 0n ||
      nominalDebt <= 0n ||
      debtSnapshot <= 0n ||
      approvalCap <
        debtSnapshot
    ) {
      throw new Error(
        "Prepared Close Position contains invalid debt or collateral values.",
      );
    }

    const market:
      VesuBorrowMarket = {
        id:
          `vesu:${pool.id}:${pair.collateralAsset.symbol}:${pair.debtAsset.symbol}`,

        chainId:
          network.chainId,

        poolAddress:
          pool.address,

        collateralAsset:
          pair.collateralAsset,

        debtAsset:
          pair.debtAsset,
      };

    const safeCalls =
      validateVesuClosePositionCalls({
        calls:
          payload.calls,

        market,

        owner,

        collateralShares,

        nominalDebt,

        approvalCap,
      });

    const knownDebt =
      findAssetBalance(
        balances,
        pair.debtAsset.id,
        "public",
      )?.amount;

    if (
      knownDebt !== null &&
      knownDebt !== undefined &&
      knownDebt <
        debtSnapshot
    ) {
      throw new Error(
        `Public ${pair.debtAsset.symbol} balance is below the current Vesu debt snapshot.`,
      );
    }

    /**
     * Confirms account and Mainnet immediately before the atomic close.
     */
    const assertSession =
      async () => {
        const selected =
          account.walletProvider as unknown as WalletWithStarknetFeaturesV6;

        const [
          walletChain,
          accounts,
        ] =
          await Promise.all([
            walletV6.requestChainId(
              selected,
            ),

            account.requestAccounts(
              true,
            ),
          ]);

        if (
          currentAccount.current !==
            account ||
          String(walletChain) !==
            network.chainId ||
          !accounts[0] ||
          felt(accounts[0]) !==
            owner
        ) {
          throw new Error(
            "Wallet account or network changed. Reconnect Ready on Starknet Mainnet.",
          );
        }
      };

    closeVesuSubmitting.current =
      true;

    setBusy(true);
    setError(null);

    try {
      await assertSession();

      if (
        Date.now() >
        payload.expiresAt
      ) {
        throw new Error(
          "Close Position review expired before signing.",
        );
      }

      const response =
        await account.execute(
          safeCalls,
        );

      const hash =
        response.transaction_hash;

      if (
        !/^0x[0-9a-f]{1,64}$/i.test(
          hash,
        )
      ) {
        throw new Error(
          "Ready did not return a valid Close Position transaction hash.",
        );
      }

      setTx({
        kind:
          "pending",

        label,

        hash,
      });

      try {
        await waitForSubmittedTransaction(
          hash,
          network.provider,
        );

        setTx({
          kind:
            "confirmed",

          label,

          hash,
        });
      } catch {
        setTx({
          kind:
            "submitted",

          label,

          hash,
        });
      }

      try {
        await refreshPublicBalance();
      } catch {
        // Portfolio can still be refreshed manually.
      }

      return hash;
    } finally {
      closeVesuSubmitting.current =
        false;

      setBusy(false);
    }
  };

  const executeBridge = async (input: BridgeCall[], expectedAddress: string): Promise<string> => {
    if (bridgeSubmitting.current || busy || !walletAccount) throw new Error("Connect your wallet and finish the current wallet request first.");
    const account = walletAccount;
    const calls = validateFundingCalls(input);
    const assertSession = async () => {
      const selected = account.walletProvider as unknown as WalletWithStarknetFeaturesV6;
      const [network, accounts] = await Promise.all([walletV6.requestChainId(selected), account.requestAccounts(true)]);
      if (currentAccount.current !== account || String(network) !== constants.StarknetChainId.SN_SEPOLIA || !accounts[0] || felt(accounts[0]) !== felt(expectedAddress) || felt(account.address) !== felt(expectedAddress)) {
        throw new Error("Wallet account or network changed. Reconnect the intended account on Starknet Sepolia.");
      }
    };
    bridgeSubmitting.current = true;
    setBusy(true); setError(null);
    try {
      await assertSession();
      const balance = await sepoliaProvider.callContract({ contractAddress: calls[0].contractAddress, entrypoint: "balance_of", calldata: [expectedAddress] });
      if (balance.length < 2) throw new Error("Could not read the bridge token balance.");
      const available = BigInt(balance[0]) + (BigInt(balance[1]) << 128n);
      if (available < BigInt(calls[0].calldata[1])) throw new Error("Insufficient public token balance for this bridge.");
      await assertSession();
      // Wallet approval covers exact-amount approval + HTLC initiation in one transaction.
      const response = await account.execute(calls);
      if (!/^0x[0-9a-f]{1,64}$/i.test(response.transaction_hash)) throw new Error("The wallet did not return a valid transaction hash. Check Activity before retrying.");
      return response.transaction_hash;
    } finally {
      bridgeSubmitting.current = false;
      setBusy(false);
    }
  };

  const value = useMemo<CarelTestnetContextValue>(
    () => ({
      wallets,
      address,
      chainId,
      connected,
      connecting,
      strk20Capable,
      specs,
      publicStrk,
      privateStrk,
      privateXstrk,
      balances,
      privateRevealed,
      busy,
      error,
      tx,
      maturityTarget,
      currentBlock,
      connect,
      disconnect,
      refreshPublicBalance,
      refreshAssetBalances,
      revealPrivateBalance,
      shield,
      unshield,
      executeShieldAsset,
      executeUnshieldAsset,
      executeUnshieldCollateral,
      executeSwap,
      executeShieldSwap,
      executeUnshieldSwapStart,
      completeUnshieldSwap,
      executeStaking,
      executeStakingAction,
      executeShieldStaking,
      executeBridge,
      executeShieldLend,
      executeLend,
      executeBorrow,
      executeRepay,
      executeCloseVesuPosition,
      executeAddVesuCollateral,
      executeWithdrawVesuCollateral,
    }),
    [
      wallets,
      walletAccount,
      address,
      chainId,
      connected,
      connecting,
      strk20Capable,
      specs,
      publicStrk,
      privateStrk,
      privateXstrk,
      balances,
      privateRevealed,
      busy,
      error,
      tx,
      maturityTarget,
      currentBlock,
    ],
  );

  return (
    <CarelTestnetContext.Provider value={value}>
      {children}
    </CarelTestnetContext.Provider>
  );
}

export function useCarelTestnet() {
  const context = useContext(CarelTestnetContext);

  if (!context) {
    throw new Error("useCarelTestnet must be used inside CarelTestnetProvider.");
  }

  return context;
}

export function WalletStatusButton() {
  const {
    address,
    connected,
    connecting,
    chainId,
    strk20Capable,
    connect,
    disconnect,
  } = useCarelTestnet();

  if (!connected) {
    return (
      <button
        className="wallet-pill carel-wallet-button"
        type="button"
        disabled={connecting}
        onClick={() => void connect()}
      >
        <span className="wallet-dot" />
        {connecting ? "Connecting…" : "Connect Ready"}
      </button>
    );
  }

  const isSepolia = chainId === constants.StarknetChainId.SN_SEPOLIA;

  return (
    <button
      className="wallet-pill carel-wallet-button"
      type="button"
      onClick={disconnect}
      title="Disconnect CAREL session"
    >
      <span className={`wallet-dot ${isSepolia && strk20Capable ? "live" : "warn"}`} />
      {shortAddress(address)}
      <small>{isSepolia ? (strk20Capable ? "STRK20" : "NO PRIVACY") : "SWITCH SEPOLIA"}</small>
      <ChevronDown size={13} />
    </button>
  );
}

export function Strk20TestnetPanel() {
  const {
    wallets,
    address,
    chainId,
    connected,
    connecting,
    strk20Capable,
    specs,
    publicStrk,
    privateStrk,
    privateRevealed,
    busy,
    error,
    tx,
    maturityTarget,
    currentBlock,
    connect,
    refreshPublicBalance,
    revealPrivateBalance,
    shield,
    unshield,
  } = useCarelTestnet();

  const [amount, setAmount] = useState("1");
  const isSepolia = chainId === constants.StarknetChainId.SN_SEPOLIA;
  const remaining =
    maturityTarget && currentBlock !== null
      ? Math.max(0, maturityTarget - currentBlock)
      : null;

  return (
    <article className="panel strk20-live-panel">
      <div className="panel-head compact-head">
        <div>
          <span className="panel-kicker">TESTNET EXECUTION</span>
          <h2>STRK20 privacy rail</h2>
        </div>
        <span className={`testnet-live-chip ${connected && isSepolia && strk20Capable ? "ready" : ""}`}>
          <i />
          {connected && isSepolia && strk20Capable ? "READY" : "SEPOLIA"}
        </span>
      </div>

      {!connected ? (
        <div className="testnet-connect-state">
          <div className="testnet-icon">
            <WalletCards size={21} />
          </div>
          <strong>Connect a privacy-enabled Starknet wallet.</strong>
          <p>
            CAREL checks Wallet API support without reading private balances.
            Private balance access is requested separately.
          </p>

          <div className="detected-wallets">
            {wallets.length ? (
              wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  type="button"
                  disabled={connecting}
                  onClick={() => void connect(wallet.name)}
                >
                  {wallet.name}
                </button>
              ))
            ) : (
              <span>No compatible injected Starknet wallet detected yet.</span>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="testnet-status-grid">
            <div>
              <small>Network</small>
              <strong className={isSepolia ? "ok" : "warn"}>
                {isSepolia ? "Starknet Sepolia" : "Wrong network"}
              </strong>
            </div>
            <div>
              <small>STRK20 Wallet API</small>
              <strong className={strk20Capable ? "ok" : "warn"}>
                {strk20Capable ? "Supported" : "Unavailable"}
              </strong>
            </div>
          </div>

          {!isSepolia && (
            <div className="testnet-warning">
              Switch Ready/Xverse to <strong>Starknet Sepolia</strong>. CAREL will
              not submit STRK20 actions on another network.
            </div>
          )}

          {isSepolia && !strk20Capable && (
            <div className="testnet-warning">
              Wallet API specs: {specs.length ? specs.join(", ") : "none reported"}.
              CAREL requires STRK20 Wallet API ≥ 0.10.
            </div>
          )}

          <div className="testnet-balances">
            <div>
              <span>Public STRK</span>
              <strong>{publicStrk === null ? "—" : formatUnits18(publicStrk)}</strong>
              <button type="button" disabled={busy} onClick={() => void refreshPublicBalance()}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            <div className="private">
              <span>Private STRK</span>
              <strong>
                {privateRevealed
                  ? privateStrk === null
                    ? "0"
                    : formatUnits18(privateStrk)
                  : "Hidden"}
              </strong>
              <button
                type="button"
                disabled={busy || !isSepolia || !strk20Capable}
                onClick={() => void revealPrivateBalance()}
              >
                <EyeOff size={13} />
                {privateRevealed ? "Refresh private" : "Reveal private"}
              </button>
            </div>
          </div>

          <p className="balance-consent-copy">
            Private balance is never used as a capability probe. CAREL asks only
            when you explicitly reveal it.
          </p>

          <div className="testnet-amount">
            <label htmlFor="strk20-amount">Amount</label>
            <div>
              <input
                id="strk20-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/[^0-9.]/g, ""))
                }
              />
              <strong>STRK</strong>
            </div>
          </div>

          <div className="testnet-actions">
            <button
              type="button"
              disabled={busy || !isSepolia || !strk20Capable}
              onClick={() => void shield(amount)}
            >
              <Shield size={15} />
              Shield
            </button>
            <button
              type="button"
              disabled={busy || !isSepolia || !strk20Capable}
              onClick={() => void unshield(amount)}
            >
              <Unlock size={15} />
              Unshield
            </button>
          </div>

          <div className="privacy-truth-list">
            <span><i className="public" /> Shield amount + deposit are public.</span>
            <span><i className="private" /> Mature private notes are protected.</span>
            <span><i className="public" /> Unshield amount + destination are public.</span>
          </div>

          <div className="testnet-note">
            <LockKeyhole size={15} />
            <span>
              Shield can require <strong>two wallet confirmations</strong>:
              ERC-20 approval, then privacy-pool deposit. Fresh notes mature in
              roughly <strong>10 blocks</strong>.
            </span>
          </div>

          {remaining !== null && (
            <div className={`maturity-tracker ${remaining === 0 ? "done" : ""}`}>
              {remaining === 0 ? <Check size={15} /> : <RefreshCw className="spin" size={15} />}
              <span>
                {remaining === 0
                  ? "New private note should now be mature."
                  : `Waiting for note maturity · ~${remaining} blocks remaining`}
              </span>
            </div>
          )}

          {tx.kind !== "idle" && (
            <div className={`testnet-tx ${tx.kind}`}>
              <div>
                <small>{tx.kind === "pending" ? "SUBMITTED" : tx.kind.toUpperCase()}</small>
                <strong>{tx.label}</strong>
              </div>
              <a href={`${SEPOLIA_EXPLORER_TX}${tx.hash}`} target="_blank" rel="noreferrer">
                View tx ↗
              </a>
            </div>
          )}

          {error && <div className="testnet-error">{error}</div>}

          <div className="testnet-address">
            <span>{shortAddress(address)}</span>
            <small>Connected session · secrets stay inside the wallet</small>
          </div>
        </>
      )}
    </article>
  );
}
