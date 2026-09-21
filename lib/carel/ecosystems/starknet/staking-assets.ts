import {
  CAREL_EXECUTION_CAPABILITY_REGISTRY,
} from "@/lib/carel/adapters";

import type {
  AssetRef,
} from "@/lib/carel/core/assets";

import type {
  StakeIntent,
} from "@/lib/carel/core/execution";

import {
  selectExecutionCapability,
} from "@/lib/carel/core/routes";

import {
  getCarelNetwork,
} from "@/lib/carel/networks";

import {
  AVNU_STAKING_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/avnu/staking-adapter";

import {
  ENDUR_SHIELD_STAKING_ADAPTER_ID,
} from "@/lib/carel/ecosystems/starknet/protocols/endur/adapter";


export type StarknetStakingDiscoveryMode =
  | "normal"
  | "shield"
  | "unshield";


export type StarknetStakingAssetOption =
  Readonly<{
    asset:
      AssetRef;

    providerId:
      string;

    privacy:
      "public"
      | "private";

    outputAsset?:
      AssetRef;
  }>;


/**
 * Providers that currently have an attached React/runtime implementation.
 *
 * Adding another Starknet staking provider later requires:
 * 1. registering its capability;
 * 2. adding its runtime executor;
 *
 * The UI itself does not need another asset hardcode.
 */
export const STARKNET_STAKING_RUNTIME_PROVIDER_IDS =
  new Set<string>([
    AVNU_STAKING_ADAPTER_ID,
    ENDUR_SHIELD_STAKING_ADAPTER_ID,
  ]);


function selectCapability(
  intent:
    StakeIntent,

  chainId:
    string,

  account:
    string,
) {
  const selected =
    selectExecutionCapability(
      intent,
      {
        chainId,

        account:
          account.trim() ||
          "0x1",
      },
      [
        ...CAREL_EXECUTION_CAPABILITY_REGISTRY
          .values(),
      ],
      "starknet",
    );

  if (
    !selected ||
    !STARKNET_STAKING_RUNTIME_PROVIDER_IDS
      .has(
        selected.id,
      )
  ) {
    return null;
  }

  return selected;
}


/**
 * Discovers executable staking assets from registered provider capabilities.
 *
 * No STRK/ETH/WBTC/etc. symbol is hardcoded here.
 */
export function getStarknetStakingAssetOptions(
  chainId:
    string,

  account:
    string,

  mode:
    StarknetStakingDiscoveryMode,
): readonly StarknetStakingAssetOption[] {
  const network =
    getCarelNetwork(
      chainId,
    );

  if (!network) {
    return [];
  }

  const results:
    StarknetStakingAssetOption[] =
    [];


  if (
    mode !==
      "shield"
  ) {
    for (
      const asset
      of network.assetList
    ) {
      const intent:
        StakeIntent = {
        action:
          "stake",

        assetId:
          asset.id,

        amount:
          1n,

        privacy:
          "public",
      };


      const capability =
        selectCapability(
          intent,
          chainId,
          account,
        );


      if (!capability) {
        continue;
      }


      results.push({
        asset,

        providerId:
          capability.id,

        privacy:
          "public",
      });
    }


    return results;
  }


  /*
   * Shield staking may produce a different receipt asset.
   *
   * Search registered asset pairs and let provider capabilities decide
   * which pair is executable.
   */
  for (
    const source
    of network.assetList
  ) {
    let found:
      StarknetStakingAssetOption | null =
      null;


    for (
      const target
      of network.assetList
    ) {
      if (
        target.id ===
          source.id
      ) {
        continue;
      }


      const intent:
        StakeIntent = {
        action:
          "stake",

        assetId:
          source.id,

        targetAssetId:
          target.id,

        amount:
          1n,

        privacy:
          "private",
      };


      const capability =
        selectCapability(
          intent,
          chainId,
          account,
        );


      if (!capability) {
        continue;
      }


      found = {
        asset:
          source,

        outputAsset:
          target,

        providerId:
          capability.id,

        privacy:
          "private",
      };

      break;
    }


    if (found) {
      results.push(
        found,
      );
    }
  }


  return results;
}
