export type BalanceVisibility =
  | "public"
  | "private";

export type AssetBalance = Readonly<{
  assetId: string;
  chainId: string;
  visibility: BalanceVisibility;

  /**
   * null means CAREL does not currently know the balance.
   * This is intentionally different from a known zero balance.
   */
  amount: bigint | null;

  source?: string;
  updatedAt?: number;
}>;

export type BalanceBook =
  ReadonlyMap<string, AssetBalance>;

export type LayeredBalance = Readonly<{
  public: AssetBalance | null;
  private: AssetBalance | null;
  knownTotal: bigint;
  hasUnknown: boolean;
}>;

/**
 * Produces the stable key used for public/private balance storage.
 */
export function balanceKey(
  assetId: string,
  visibility: BalanceVisibility,
): string {
  return `${assetId}:${visibility}`;
}

/**
 * Creates a balance book while preventing duplicate public/private records.
 */
export function createBalanceBook(
  balances: readonly AssetBalance[],
): BalanceBook {
  const book =
    new Map<string, AssetBalance>();

  for (const balance of balances) {
    const key =
      balanceKey(
        balance.assetId,
        balance.visibility,
      );

    if (book.has(key)) {
      throw new Error(
        `Duplicate CAREL balance: ${key}`,
      );
    }

    book.set(
      key,
      balance,
    );
  }

  return book;
}

/**
 * Reads one public or private asset balance from a balance book.
 */
export function getBalance(
  book: BalanceBook,
  assetId: string,
  visibility: BalanceVisibility,
): AssetBalance | null {
  return (
    book.get(
      balanceKey(
        assetId,
        visibility,
      ),
    ) ?? null
  );
}

/**
 * Combines public/private balance state without pretending an unknown
 * private balance is zero.
 */
export function summarizeAssetBalance(
  balances: readonly AssetBalance[],
  assetId: string,
): LayeredBalance {
  const publicBalance =
    balances.find(
      (balance) =>
        balance.assetId ===
          assetId &&
        balance.visibility ===
          "public",
    ) ?? null;

  const privateBalance =
    balances.find(
      (balance) =>
        balance.assetId ===
          assetId &&
        balance.visibility ===
          "private",
    ) ?? null;

  const rows = [
    publicBalance,
    privateBalance,
  ].filter(
    (
      row,
    ): row is AssetBalance =>
      row !== null,
  );

  const knownTotal =
    rows.reduce(
      (total, row) =>
        total +
        (row.amount ?? 0n),
      0n,
    );

  return {
    public: publicBalance,
    private: privateBalance,
    knownTotal,
    hasUnknown:
      rows.some(
        (row) =>
          row.amount === null,
      ),
  };
}
