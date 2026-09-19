import type {
  Call,
} from "starknet";

import {
  sameStarknetAddress,
} from "@/lib/carel/ecosystems/starknet/addresses";

export type VesuCallValidationSpec =
  Readonly<{
    addressIndexes:
      readonly number[];
  }>;

/**
 * Normalizes Starknet calldata into comparable string words.
 */
export function vesuCallData(
  call: Call,
): string[] {
  if (
    !Array.isArray(
      call.calldata,
    )
  ) {
    throw new Error(
      "CAREL received malformed Vesu calldata.",
    );
  }

  return call.calldata.map(
    (value) =>
      String(value),
  );
}

/**
 * Compares numeric calldata independently of hex padding.
 */
export function sameVesuWord(
  actual: string,
  expected: string,
): boolean {
  try {
    return (
      BigInt(actual) ===
      BigInt(expected)
    );
  } catch {
    return false;
  }
}

function countWord(
  value: number,
): string {
  if (value === 1) {
    return "one";
  }

  if (value === 2) {
    return "two";
  }

  if (value === 3) {
    return "three";
  }

  return String(value);
}

/**
 * Verifies a complete server-prepared Vesu call sequence against calls
 * independently reconstructed by CAREL.
 */
export function validateVesuCallSequence({
  calls,
  expected,
  specs,
  label,
}: {
  calls: readonly Call[];
  expected: readonly Call[];
  specs:
    readonly VesuCallValidationSpec[];
  label: string;
}): Call[] {
  if (
    calls.length !==
    expected.length
  ) {
    throw new Error(
      `CAREL requires exactly ${countWord(
        expected.length,
      )} Vesu ${label} ${
        expected.length === 1
          ? "call"
          : "calls"
      }.`,
    );
  }

  if (
    specs.length !==
    expected.length
  ) {
    throw new Error(
      `Internal CAREL Vesu ${label} validation shape mismatch.`,
    );
  }

  for (
    let callIndex = 0;
    callIndex <
    expected.length;
    callIndex += 1
  ) {
    const actualCall =
      calls[callIndex];

    const expectedCall =
      expected[callIndex];

    if (
      !sameStarknetAddress(
        actualCall.contractAddress,
        expectedCall.contractAddress,
      ) ||
      actualCall.entrypoint !==
        expectedCall.entrypoint
    ) {
      throw new Error(
        `CAREL blocked a mismatched Vesu ${label} call.`,
      );
    }

    const actualData =
      vesuCallData(
        actualCall,
      );

    const expectedData =
      vesuCallData(
        expectedCall,
      );

    if (
      actualData.length !==
      expectedData.length
    ) {
      throw new Error(
        `CAREL blocked malformed Vesu ${label} calldata.`,
      );
    }

    const addressIndexes =
      new Set(
        specs[
          callIndex
        ].addressIndexes,
      );

    for (
      let index = 0;
      index <
      expectedData.length;
      index += 1
    ) {
      const matches =
        addressIndexes.has(
          index,
        )
          ? sameStarknetAddress(
              actualData[index],
              expectedData[index],
            )
          : sameVesuWord(
              actualData[index],
              expectedData[index],
            );

      if (!matches) {
        throw new Error(
          `CAREL blocked altered Vesu ${label} calldata.`,
        );
      }
    }
  }

  return [
    ...expected,
  ];
}
