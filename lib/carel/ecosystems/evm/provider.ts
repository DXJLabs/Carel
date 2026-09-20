export type Eip1193RequestArguments =
  Readonly<{
    method: string;
    params?:
      | readonly unknown[]
      | Readonly<Record<string, unknown>>;
  }>;

export interface Eip1193Provider {
  request(
    args: Eip1193RequestArguments,
  ): Promise<unknown>;
}

/**
 * Parses an EVM JSON-RPC hexadecimal quantity without converting through
 * JavaScript Number, preserving full uint256 precision.
 */
export function parseEvmQuantity(
  value: unknown,
): bigint {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-f]+$/i.test(
      value,
    )
  ) {
    throw new Error(
      "EVM provider returned an invalid hexadecimal quantity.",
    );
  }

  return BigInt(
    value,
  );
}

/**
 * Validates and canonicalizes an EVM account for internal comparisons.
 * Display/checksum formatting remains a wallet/UI responsibility.
 */
export function normalizeEvmAddress(
  value: string,
): string {
  const address =
    value.trim();

  if (
    !/^0x[0-9a-fA-F]{40}$/.test(
      address,
    )
  ) {
    throw new Error(
      "Invalid EVM account address.",
    );
  }

  return address.toLowerCase();
}
