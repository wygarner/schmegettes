# Clue Catalog: Interaction Design

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

1. The admin runs the load for an environment: every season, or a list ("seasons 1–5"). Locally `mise run clues:import -- --seasons 1-5`; staging and production with the **Load Clues** workflow.
2. Each season is downloaded, its rows are checked against the rules, and its clues are saved.
3. The run ends with one summary line per season and a total:

```text
season  clues read  new clues  categories kept  incomplete  host note  show name  sound picture
     1       8,252      6,188            1,368         647         13          3              8
…
    40      13,784     11,920            2,568         213        198          8              3
 total     515,894    412,976           89,636      15,534      6,116      3,365            230
failed: season 17 (download timed out) - run again to finish
```

4. Running again loads nothing new for seasons already loaded (0 in **new clues**) and retries the failed ones.

### Rating the catalog (admin)

States of one category:

```text
unrated (plays as Medium) ──▶ rated Easy | Medium | Hard   (never changes again)
        │
        └──▶ failed (stays unrated, retried on the next run)
```

A run ends with one summary:

```text
rated   easy     medium   hard     failed   still unrated
89,636  29,880   29,876   29,880   0        0
```

Running it again right after rates nothing (`rated 0`).

### Edge cases

| Situation | What happens |
|---|---|
| Same season loaded twice | No change. Clue ids, and so players' seen history, stay the same. |
| Run stopped partway (laptop closed, deploy) | Seasons that finished stay loaded. Running again finishes the rest. |
| A game is on the board during a load | Unaffected. Its board was built at Start. |
| Upstream fixes a clue's text later | Loads as a new clue; its category then has 6 clues and is left out as incomplete. It never reaches a board with a duplicate. |
| A season is loaded after the catalog was rated | Its categories play as Medium until the next rating run labels them |
| Claude can't rate a category (error, refusal, unreadable reply) | It stays unrated, plays as Medium, and is counted under **failed**. The next run tries it again. |
| Rating run stopped partway | Labels already given stay. Running again rates the rest. |
| The production load is attempted before private access is live | Refused: the loader exits with "private access is not live" when the database has no `public.hosts` ([feature brief](./feature-brief.md#source)). |
