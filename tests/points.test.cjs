const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const Module =
  require("node:module");

const ts =
  require("typescript");

const ROOT =
  path.resolve(
    __dirname,
    "..",
  );

require.extensions[".ts"] =
  (
    mod,
    filename,
  ) => {
    const source =
      ts.transpileModule(
        fs.readFileSync(
          filename,
          "utf8",
        ),
        {
          compilerOptions: {
            module:
              ts.ModuleKind.CommonJS,

            target:
              ts.ScriptTarget.ES2020,

            esModuleInterop:
              true,
          },
        },
      ).outputText;

    mod._compile(
      source,
      filename,
    );
  };

const originalResolveFilename =
  Module._resolveFilename;

Module._resolveFilename =
  function (
    request,
    parent,
    isMain,
    options,
  ) {
    const resolved =
      typeof request ===
        "string" &&
      request.startsWith("@/")
        ? path.join(
            ROOT,
            request.slice(2),
          )
        : request;

    return originalResolveFilename.call(
      this,
      resolved,
      parent,
      isMain,
      options,
    );
  };


const points =
  require(
    "../lib/carel/points/model.ts",
  );


test(
  "privacy labels are classified before generic action labels",
  () => {
    assert.equal(
      points
        .pointActionFromLabel(
          "Shield Swap STRK → USDC",
        ),
      "shield",
    );

    assert.equal(
      points
        .pointActionFromLabel(
          "Unshield Swap USDC → STRK",
        ),
      "unshield",
    );
  },
);


test(
  "confirmed CAREL actions receive configured Points",
  () => {
    assert.equal(
      points
        .pointsForAction(
          "shield",
        ),
      100,
    );

    assert.equal(
      points
        .pointsForAction(
          "swap",
        ),
      40,
    );

    assert.equal(
      points
        .pointsForAction(
          "bridge",
        ),
      75,
    );
  },
);


test(
  "pending and submitted executions do not earn Points",
  () => {
    const summary =
      points
        .buildPointsSummary(
          [
            {
              hash: "0x1",
              label: "Shield STRK",
              status: "pending",
              ts: 1,
            },
            {
              hash: "0x2",
              label: "Swap STRK for USDC",
              status: "submitted",
              ts: 2,
            },
          ],
          10,
        );

    assert.equal(
      summary.total,
      0,
    );

    assert.equal(
      summary.history.length,
      0,
    );
  },
);


test(
  "transaction hash is rewarded at most once",
  () => {
    const summary =
      points
        .buildPointsSummary(
          [
            {
              hash: "0xABC",
              label: "Shield STRK",
              status: "confirmed",
              ts: 2,
            },
            {
              hash: "0xabc",
              label: "Shield STRK",
              status: "confirmed",
              ts: 1,
            },
          ],
          10,
        );

    assert.equal(
      summary.total,
      100,
    );

    assert.equal(
      summary.history.length,
      1,
    );
  },
);


test(
  "unknown transaction labels fail closed",
  () => {
    const summary =
      points
        .buildPointsSummary(
          [
            {
              hash: "0x3",
              label: "Unknown wallet action",
              status: "confirmed",
              ts: 1,
            },
          ],
          10,
        );

    assert.equal(
      summary.total,
      0,
    );
  },
);


test(
  "summary calculates seven day activity and level progress",
  () => {
    const day =
      24 *
      60 *
      60 *
      1000;

    const now =
      10 *
      day;

    const summary =
      points
        .buildPointsSummary(
          [
            {
              hash: "0x1",
              label: "Shield STRK",
              status: "confirmed",
              ts: now - day,
            },
            {
              hash: "0x2",
              label: "Bridge BTC",
              status: "confirmed",
              ts: now - 8 * day,
            },
            {
              hash: "0x3",
              label: "Swap STRK for USDC",
              status: "confirmed",
              ts: now - 2 * day,
            },
          ],
          now,
        );

    assert.equal(
      summary.total,
      215,
    );

    assert.equal(
      summary.last7Days,
      140,
    );

    assert.equal(
      summary.level,
      1,
    );

    assert.equal(
      summary.levelProgress,
      215,
    );
  },
);


test(
  "season total is separated from lifetime total",
  () => {
    const day =
      24 *
      60 *
      60 *
      1000;

    const now =
      20 *
      day;

    const season = {
      id: "season-test",
      name: "Season Test",
      status: "active",
      startsAt:
        now -
        2 *
          day,
    };

    const summary =
      points
        .buildPointsSummary(
          [
            {
              hash: "0xold",
              label: "Bridge BTC",
              status: "confirmed",
              ts:
                now -
                5 *
                  day,
            },
            {
              hash: "0xnew",
              label: "Shield STRK",
              status: "confirmed",
              ts:
                now -
                day,
            },
          ],
          now,
          season,
        );

    assert.equal(
      summary.seasonTotal,
      100,
    );

    assert.equal(
      summary.lifetimeTotal,
      175,
    );

    assert.equal(
      summary.history.length,
      1,
    );

    assert.equal(
      summary.lifetimeHistory.length,
      2,
    );
  },
);


test(
  "season end timestamp bounds season activity",
  () => {
    const season = {
      id: "season-ended",
      name: "Season Ended",
      status: "ended",
      startsAt: 100,
      endsAt: 200,
    };

    const summary =
      points
        .buildPointsSummary(
          [
            {
              hash: "0xbefore",
              label: "Shield STRK",
              status: "confirmed",
              ts: 99,
            },
            {
              hash: "0xduring",
              label: "Swap STRK for USDC",
              status: "confirmed",
              ts: 150,
            },
            {
              hash: "0xafter",
              label: "Bridge BTC",
              status: "confirmed",
              ts: 201,
            },
          ],
          250,
          season,
        );

    assert.equal(
      summary.seasonTotal,
      40,
    );

    assert.equal(
      summary.lifetimeTotal,
      215,
    );

    assert.equal(
      summary.season.id,
      "season-ended",
    );
  },
);
