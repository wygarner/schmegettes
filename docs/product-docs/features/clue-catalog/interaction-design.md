# Clue Catalog: Interaction Design

> **Not yet implemented.** See the [feature brief](./feature-brief.md).

Players never interact with the catalog directly. What changes for them is the board: real categories instead of "SAMPLE" ones. The admin runs the load.

## What players see

Before (seed data):

```text
SAMPLE SINGLE 3 │ SAMPLE SINGLE 11 │ SAMPLE SINGLE 7 │ …
     $200       │      $200        │      $200       │
```

After:

```text
SCIENCE CLASS │ 1789 BOOKS │ WORLD CAPITALS │ …
    $200      │    $200    │      $200      │
```

The clue on the TV (and read aloud) is the aired text, cleaned up:

```text
          SCIENCE CLASS · $200

  In natural form a mixture of 3 isotopes, this element
  is the most abundant in the Earth's crust & in the
  human body
```

Everything else about play is unchanged ([gameplay](../gameplay/interaction-design.md)). The "&" in a clue is read aloud as "and".

If an environment has too few categories for a board (only possible before the first load), **Start** fails as it does today: everyone returns to the lobby with "Couldn't build a board. Try again." ([game history](../game-history/interaction-design.md#start-a-game-host)).

## Loading the catalog (admin)

### States of one season

```text
pending ──▶ downloading ──▶ checking ──▶ loaded
                 │              │
                 └──────────────┴──▶ failed (the run goes on to the next season)
```

### A run

1. The admin runs the load for an environment: every season, or a list ("seasons 1–5").
2. Each season is downloaded, its rows are checked against the rules, and its clues are saved.
3. The run ends with one summary line per season and a total:

```text
season    clues read  categories kept  left out: incomplete  host note  show name  sound/picture
     1          8,252            1,368                   647         13          3              8
    40         13,784            2,566                   213        198          8              5
…
 total       …                …                       …          …          …              …
failed: season 17 (download timed out) — run again to finish
```

4. Running again loads nothing new for seasons already loaded ("0 new clues") and retries the failed ones.

### Edge cases

| Situation | What happens |
|---|---|
| Same season loaded twice | No change. Clue ids, and so players' seen history, stay the same. |
| Run stopped partway (laptop closed, deploy) | Seasons that finished stay loaded. Running again finishes the rest. |
| A game is on the board during a load | Unaffected. Its board was built at Start. |
| Upstream fixes a clue's text later | Loads as a new clue; its category then has 6 clues and is left out as incomplete. It never reaches a board with a duplicate. |
| The production load is attempted before private access is live | Not allowed: the admin doesn't run it ([feature brief](./feature-brief.md#source)). |
