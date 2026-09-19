const STARKNET_ADDRESS_LIMIT =
  1n << 251n;

/**
 * Checks Starknet address shape/range without depending on a UI component.
 */
export function isStarknetAddress(
  value: unknown,
): boolean {
  try {
    const raw =
      String(value).trim();

    if (
      !/^(?:0x[0-9a-f]+|\d+)$/i.test(
        raw,
      )
    ) {
      return false;
    }

    const numeric =
      BigInt(raw);

    return (
      numeric >= 0n &&
      numeric <
        STARKNET_ADDRESS_LIMIT
    );
  } catch {
    return false;
  }
}

/**
 * Produces a canonical Starknet address representation for storage/comparison.
 */
export function normalizeStarknetAddress(
  value: unknown,
): string {
  if (
    !isStarknetAddress(value)
  ) {
    throw new Error(
      "Invalid Starknet address.",
    );
  }

  return (
    `0x${BigInt(
      String(value),
    ).toString(16)}`
  );
}

/**
 * Compares Starknet addresses while ignoring leading zeroes/casing.
 */
export function sameStarknetAddress(
  left: unknown,
  right: unknown,
): boolean {
  try {
    return (
      normalizeStarknetAddress(
        left,
      ) ===
      normalizeStarknetAddress(
        right,
      )
    );
  } catch {
    return false;
  }
}

/**
 * Compares arbitrary Starknet felt values.
 * Kept separate from address validation because not every felt is an address.
 */
export function sameStarknetFelt(
  left: unknown,
  right: unknown,
): boolean {
  try {
    return (
      BigInt(String(left)) ===
      BigInt(String(right))
    );
  } catch {
    return false;
  }
}
