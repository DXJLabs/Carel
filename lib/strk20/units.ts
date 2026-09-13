const ZERO = BigInt(0);
const TEN = BigInt(10);
const DECIMALS = BigInt(18);
const SCALE = TEN ** DECIMALS;

export function parseUnits18(value: string): bigint {
  const normalized = value.trim();

  if (!/^\d+(\.\d{0,18})?$/.test(normalized)) {
    throw new Error("Enter a valid amount with up to 18 decimals.");
  }

  const [whole = "0", fraction = ""] = normalized.split(".");
  const padded = `${fraction}000000000000000000`.slice(0, 18);

  return BigInt(whole) * SCALE + BigInt(padded || "0");
}

export function formatUnits18(value: bigint, maxDecimals = 4): string {
  const negative = value < ZERO;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const rawFraction = (absolute % SCALE)
    .toString()
    .padStart(18, "0");

  const fraction = rawFraction
    .slice(0, maxDecimals)
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function sameFelt(a: unknown, b: unknown): boolean {
  try {
    return BigInt(String(a)) === BigInt(String(b));
  } catch {
    return false;
  }
}
