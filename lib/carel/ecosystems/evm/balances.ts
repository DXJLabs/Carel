import {
  normalizeEvmAddress,
  parseEvmQuantity,
  type Eip1193Provider,
} from "./provider";

/**
 * Reads the native EVM asset balance in base units.
 */
export async function readEvmNativeBalance(
  provider: Eip1193Provider,
  account: string,
): Promise<bigint> {
  const address =
    normalizeEvmAddress(
      account,
    );

  const value =
    await provider.request({
      method:
        "eth_getBalance",

      params: [
        address,
        "latest",
      ],
    });

  return parseEvmQuantity(
    value,
  );
}
