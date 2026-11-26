// The critical path, played for real: a signed-in host on an iPhone-sized landscape screen and
// two phones play a whole one-board game. Rules and how to run it:
// docs/system-docs/engineering/testing-strategy.md ("End-to-end").
//
// The pages run in E2E mode (?e2e=1): narration ends at once, and window.__e2e.say(text) is what
// a phone's microphone "hears". Answers go through the real judging path. Correct responses are
// never sent to phones, so a right answer is made by the host's override, as in a real game.
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

const HOST_EMAIL = process.env.E2E_HOST_EMAIL;
const HOST_PASSWORD = process.env.E2E_HOST_PASSWORD;
// Local runs only: a host code to bootstrap the E2E host account (staging's is set up once by hand).
const HOST_CODE = process.env.E2E_HOST_CODE;

const HOST_SIZE = { width: 844, height: 390 };
const PHONE_SIZE = { width: 390, height: 844 };
const CLUE_TIMEOUT = 45_000;

declare global {
  interface Window {
    __e2e?: { say: (text: string) => boolean; listening: () => boolean };
  }
}

async function device(browser: Browser, size: { width: number; height: number }, phone: boolean) {
  return browser.newContext({
    viewport: size,
    hasTouch: true,
    isMobile: phone,
    permissions: ["microphone"],
  });
}

async function open(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto("/?e2e=1");
  await expect(page.getByRole("heading", { name: "SCHMEGETTES" })).toBeVisible();
  return page;
}

/** Answers the "what should we call you?" sheet if it shows up. */
async function nameIfAsked(page: Page, name: string) {
  const sheet = page.getByRole("dialog", { name: "What should we call you?" });
  await sheet.waitFor({ timeout: 3_000 }).catch(() => undefined);
  if (await sheet.isVisible()) {
    await sheet.getByRole("textbox", { name: "Your name" }).fill(name);
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toBeHidden();
  }
}

async function signInHost(page: Page) {
  await page.getByRole("button", { name: "Sign in" }).click();
  const sheet = page.getByRole("dialog", { name: "Keep your games" });
  await sheet.getByRole("textbox", { name: "Email" }).fill(HOST_EMAIL ?? "");
  await sheet.getByRole("textbox", { name: "Password" }).fill(HOST_PASSWORD ?? "");
  await sheet.getByRole("button", { name: "Sign in" }).click();
  const failed = sheet.getByText("That email and password don't match.");
  const outcome = await Promise.race([
    sheet.waitFor({ state: "hidden" }).then(() => "in" as const),
    failed.waitFor().then(() => "failed" as const),
  ]);
  if (outcome === "failed") {
    if (!HOST_CODE) throw new Error("The E2E host can't sign in: check E2E_HOST_EMAIL and E2E_HOST_PASSWORD.");
    // Local bootstrap: create the account (it gets host access below).
    await sheet.locator("label", { hasText: "Create account" }).click();
    await sheet.getByRole("button", { name: "Create account" }).click();
    await expect(sheet).toBeHidden();
  }
  await nameIfAsked(page, "E2E Host");
}

/** Creates a room and returns its code. */
async function createRoom(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Host a game" }).click();
  const codeSheet = page.getByRole("dialog", { name: "Schmegettes is invite-only" });
  const nameSheet = page.getByRole("dialog", { name: "What's your name?" });
  await expect(codeSheet.or(nameSheet)).toBeVisible();
  if (await codeSheet.isVisible()) {
    if (!HOST_CODE) throw new Error("The E2E host has no host access here: see testing-strategy.md, End-to-end.");
    await codeSheet.getByRole("textbox", { name: "Host code" }).fill(HOST_CODE);
    await codeSheet.getByRole("button", { name: "Continue" }).click();
  }
  await nameSheet.getByRole("button", { name: "Create room" }).click();
  const region = page.getByRole("region", { name: "Room code" });
  await expect(region).toHaveText(/[A-Z0-9]/);
  return ((await region.textContent()) ?? "").replace(/\s/g, "");
}

async function join(browser: Browser, code: string, name: string): Promise<Page> {
  const page = await open(await device(browser, PHONE_SIZE, true));
  await page.getByRole("textbox", { name: "Room code" }).fill(code);
  await page.getByRole("button", { name: "Join" }).click();
  await page.getByRole("textbox", { name: "What's your name?" }).fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: `You're in, ${name}.` })).toBeVisible();
  return page;
}

function dollars(text: string): number {
  const m = text.match(/(−|-)?\$([\d,]+)/);
  if (!m?.[2]) throw new Error(`no amount in ${JSON.stringify(text)}`);
  return (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, ""));
}

/** A player's score as the TV shows it. */
async function tvScore(host: Page, name: string): Promise<number> {
  const item = host.getByRole("list", { name: "Scores" }).getByRole("listitem", { name: new RegExp(`^${name} `) });
  return dollars((await item.getAttribute("aria-label")) ?? "");
}

async function phoneScore(phone: Page): Promise<number> {
  return dollars((await phone.getByRole("status", { name: "Your score" }).textContent()) ?? "");
}

interface Player {
  name: string;
  page: Page;
}

/** The phone that has control, once one does. */
async function controller(players: Player[]): Promise<Player> {
  let found: Player | undefined;
  await expect
    .poll(
      async () => {
        for (const p of players) {
          if ((await p.page.locator("[data-clue-id]:not([disabled])").count()) > 0) found = p;
        }
        return found?.name;
      },
      { timeout: CLUE_TIMEOUT, message: "a phone gets control" },
    )
    .toBeTruthy();
  return found as Player;
}

/**
 * Says `text` into the phone's microphone once it's listening for an answer. After a buzz that
 * is moments away; after a Daily Double wager the clue is revealed and read first, so that
 * caller waits up to `timeout` (CLUE_TIMEOUT).
 */
async function say(phone: Page, text: string, timeout = 20_000) {
  const controls = async () =>
    (
      (await phone
        .getByRole("region", { name: "Your controls" })
        .textContent()
        .catch(() => "")) ?? ""
    ).replace(/\s+/g, " ");
  await expect
    .poll(() => phone.evaluate(() => window.__e2e?.listening() ?? false), {
      timeout,
      message: "the phone listens for an answer",
    })
    .toBe(true)
    .catch(async (error: Error) => {
      // What the phone shows when the wait gave up (read now, not when it started).
      throw new Error(`${error.message}\nThe phone shows: ${await controls()}`);
    });
  expect(await phone.evaluate((t) => window.__e2e?.say(t) ?? false, text)).toBe(true);
}

/** Buzzes as soon as buzzing opens, then answers. */
async function buzzAndAnswer(phone: Page, answer: string) {
  const buzzer = phone.getByRole("button", { name: "Buzz" });
  await expect(buzzer).toHaveText(/Buzz now/, { timeout: CLUE_TIMEOUT });
  await buzzer.click();
  await say(phone, answer);
}

/** The controller taps a clue and confirms. Returns true if it was a Daily Double. */
async function pick(ctl: Player, which: "lowest" | "highest" | "any"): Promise<boolean> {
  const cells = ctl.page.locator("[data-clue-id]:not([disabled])");
  const labels = await cells.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const value = (l: string) => Number(l.match(/for (\d+)$/)?.[1] ?? 0);
  const sorted = [...labels].sort((x, y) => value(x) - value(y));
  const label = which === "highest" ? sorted[sorted.length - 1] : sorted[0];
  await ctl.page.getByRole("button", { name: label, exact: true }).click();
  await ctl.page.getByRole("button", { name: "Pick" }).click();
  const wager = ctl.page.getByRole("region", { name: "Wager" });
  const buzzer = ctl.page.getByRole("button", { name: "Buzz" });
  await expect(wager.or(buzzer.filter({ hasText: /Get ready|Buzz now|Not now/ })).first()).toBeVisible({
    timeout: CLUE_TIMEOUT,
  });
  await expect(ctl.page.locator("[data-clue-id]:not([disabled])")).toHaveCount(0, { timeout: CLUE_TIMEOUT });
  return wager.isVisible();
}

/** A Daily Double for the controller: wager $5, answer, and let it be judged. */
async function playDailyDouble(ctl: Player) {
  const wager = ctl.page.getByRole("region", { name: "Wager" });
  await wager.getByRole("button", { name: "5", exact: true }).click();
  await wager.getByRole("button", { name: "Wager" }).click();
  await say(ctl.page, "a daily double guess", CLUE_TIMEOUT);
}

/** Waits until the board is back (or Final has started). */
async function boardBack(host: Page) {
  await expect(
    host
      .locator("[data-clue-id]")
      .first()
      .or(host.getByText(/Final Schmegettes/i).first()),
  ).toBeVisible({ timeout: CLUE_TIMEOUT });
}

async function override(host: Page, name: string) {
  await host.getByRole("button", { name: `Override ${name}'s answer` }).click();
  const sheet = host.getByRole("dialog", { name: "Host override" });
  const correct = sheet.getByRole("button", { name: /Mark correct/ });
  // The judge may have accepted the answer already: then there is nothing to override.
  if (await correct.isVisible()) await correct.click();
  else await sheet.getByRole("button", { name: /Keep/ }).click();
  await expect(sheet).toBeHidden();
}

test("sign in, host, join, buzz, judge, finish", async ({ browser }) => {
  test.skip(!HOST_EMAIL || !HOST_PASSWORD, "E2E_HOST_EMAIL and E2E_HOST_PASSWORD are not set");

  // 1. Every device starts as a guest; the host signs in to the E2E host account.
  const host = await open(await device(browser, HOST_SIZE, false));
  await signInHost(host);

  // 2. The host creates a room; both phones join with the code and show up in the lobby.
  const code = await createRoom(host);
  const a: Player = { name: "Phone A", page: await join(browser, code, "Phone A") };
  const b: Player = { name: "Phone B", page: await join(browser, code, "Phone B") };
  const players = [a, b];
  await expect(host.getByRole("button", { name: "Show players (2 of 6)" })).toBeVisible();

  // 3. One board only, then Start; the board appears and a phone gets control.
  await host.getByRole("button", { name: "Game options" }).click();
  const options = host.getByRole("dialog", { name: "Game options" });
  const double = options.getByRole("switch", { name: /Double Schmegettes/ });
  if (await double.isChecked()) await options.locator("label", { hasText: "Double Schmegettes" }).click();
  await expect(double).not.toBeChecked();
  await options.getByRole("button", { name: "Done" }).click();
  await host.getByRole("button", { name: "Start" }).click();
  await expect(host.getByRole("region", { name: "Board" })).toBeVisible();
  await expect(host.locator("[data-clue-id]")).toHaveCount(20);

  // Picks until a clue that isn't a Daily Double comes up (a Daily Double is played on the way).
  async function pickOpenClue(which: "lowest" | "highest"): Promise<Player> {
    for (;;) {
      const ctl = await controller(players);
      if (!(await pick(ctl, which))) return ctl;
      await playDailyDouble(ctl);
      await boardBack(host);
    }
  }

  // 4. The first buzz answers and is judged: the score changes on the TV and that phone.
  let first = await pickOpenClue("lowest");
  let second = players.find((p) => p !== first) as Player;
  const before = await tvScore(host, first.name);
  await buzzAndAnswer(first.page, "a wrong answer");
  await expect(host.getByText(new RegExp(`✗ ${first.name}:`))).toBeVisible();
  await expect.poll(() => tvScore(host, first.name)).toBeLessThan(before);
  await expect.poll(() => phoneScore(first.page)).toBe(await tvScore(host, first.name));

  // 5. A wrong answer reopens buzzing for the other phone; the host marks its answer correct.
  const secondBefore = await tvScore(host, second.name);
  await buzzAndAnswer(second.page, "the other answer");
  await override(host, second.name);
  await expect.poll(() => tvScore(host, second.name)).toBeGreaterThan(secondBefore);
  await expect.poll(() => phoneScore(second.page)).toBe(await tvScore(host, second.name));
  await boardBack(host);

  // The first phone needs a positive score for Final: it takes the biggest clue, made correct.
  const ctl = await pickOpenClue("highest");
  first = players.find((p) => p !== ctl) as Player;
  second = ctl;
  await buzzAndAnswer(first.page, "my answer");
  await override(host, first.name);
  await expect.poll(() => tvScore(host, first.name)).toBeGreaterThan(0);
  await boardBack(host);

  // 7. A phone reloads mid-game and is back in its seat with the same score.
  // (The phone without control: a phone that's picking shows the board, not its score.)
  const reloaded = players.find((p) => p !== first) as Player;
  const kept = await tvScore(host, reloaded.name);
  await reloaded.page.reload();
  await expect(reloaded.page.getByRole("status", { name: "Your score" })).toBeVisible();
  await expect.poll(() => phoneScore(reloaded.page)).toBe(kept);
  await expect.poll(() => tvScore(host, reloaded.name)).toBe(kept);

  // 6. The rest of the board times out (Daily Doubles are wagered and answered), then Final.
  while ((await host.locator("[data-clue-id]:not([aria-label$=', done'])").count()) > 0) {
    const picker = await controller(players);
    if (await pick(picker, "lowest")) await playDailyDouble(picker);
    await boardBack(host);
  }
  for (const p of players) {
    const pad = p.page.getByRole("region", { name: "Wager" });
    await expect(pad).toBeVisible({ timeout: CLUE_TIMEOUT });
    await pad.getByRole("button", { name: "1", exact: true }).click();
    await pad.getByRole("button", { name: "Lock in" }).click();
  }
  for (const p of players) {
    const field = p.page.getByRole("textbox", { name: "Your answer" });
    await expect(field).toBeVisible({ timeout: CLUE_TIMEOUT });
    await field.fill(`${p.name} final answer`);
    await p.page.getByRole("button", { name: "Submit" }).click();
  }

  // The scoreboard shows on every phone, and the game is in My games.
  for (const p of players) {
    await expect(p.page.getByText("You finished")).toBeVisible({ timeout: 3 * CLUE_TIMEOUT });
    await expect(p.page.getByRole("list", { name: "Standings" }).getByRole("listitem")).toHaveCount(2);
  }
  await a.page.goto("/games");
  const games = a.page.getByRole("region", { name: "Your games" });
  await expect(games.locator('[aria-label*=", 1st, "], [aria-label*=", 2nd, "]').first()).toBeVisible();
  await expect(games.locator('[aria-label$=", unfinished"]')).toHaveCount(0);
});
