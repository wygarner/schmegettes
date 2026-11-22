import { describe, expect, test } from "vitest";
import { spokenText } from "./spokenText";

describe("punctuation and symbols", () => {
  test.each([
    ["Connect ____", "Connect blank"],
    ["____ Dark ____", "blank Dark blank"],
    ["one—two", "one, two"],
    ["one -- two", "one, two"],
    ["one - two", "one, two"],
    ["music... bodies never lie", "music, bodies never lie"],
    ["wait…", "wait."],
    ["(hello there)", ", hello there,"],
    ["(hello there).", ", hello there."],
    ["1/8", "one eighth"],
    ["4 1/2 inches", "four and a half inches"],
    ["3/4", "three quarters"],
    ["24/7", "twenty-four seven"],
    ["and/or", "and, or"],
    ["AC/DC", "AC, DC"],
    ["Smith vs. Jones", "Smith versus Jones"],
    ["Mt. Everest", "Mount Everest"],
    ["No. 1", "number 1"],
    ["#1 song", "number 1 song"],
    ["$5 million", "five million dollars"],
    ["$1,000", "one thousand dollars"],
    ["Lewis&Clark", "Lewis and Clark"],
    ["salt &amp; pepper", "salt and pepper"],
  ])("rewrites %s", (input, output) => expect(spokenText(input)).toBe(output));

  test("leaves punctuation and forms espeak already handles", () => {
    expect(spokenText('Dr. King of St. Louis said "4th; 50%: 1,500 feet"')).toBe(
      'Dr. King of St. Louis said "4th; 50%: 1,500 feet"',
    );
  });

  test("drops unsupported symbol names without changing display text", () => {
    expect(spokenText("Look * here 😊 | now")).toBe("Look here now");
  });
});

describe("years and decades", () => {
  test.each([
    ["in 1689", "in sixteen eighty-nine"],
    ["in 1066", "in ten sixty-six"],
    ["(1601)", ", sixteen oh one,"],
    ["in 1900", "in nineteen hundred"],
    ["the year 1800", "the year eighteen hundred"],
    ["in 2001", "in two thousand one"],
    ["in 2015", "in twenty fifteen"],
    ["the 1960s", "the nineteen sixties"],
    ["the 1800s", "the eighteen hundreds"],
    ["the '80s", "the eighties"],
    ["the 80s", "the eighties"],
  ])("reads %s", (input, output) => expect(spokenText(input)).toBe(output));

  test.each(["1,500", "1689 people", "1689 miles", "1689 years", "50%"])("leaves count %s alone", (text) => {
    expect(spokenText(text)).toBe(text);
  });
});

describe("Roman numerals", () => {
  test.each([
    ["Henry VIII", "Henry the eighth"],
    ["Elizabeth II", "Elizabeth the second"],
    ["Pope Pius XII", "Pope Pius the twelfth"],
    ["Louis XIV", "Louis the fourteenth"],
    ["Thurston Howell III", "Thurston Howell the third"],
    ["Henry V", "Henry the fifth"],
    ["Pius X", "Pius the tenth"],
    ["Charles I", "Charles the first"],
    ["World War II", "World War two"],
    ["World War I", "World War One"],
    ["WORLD WAR II", "WORLD WAR two"],
    ["Super Bowl XL", "Super Bowl forty"],
    ["Rocky IV", "Rocky four"],
    ["Chapter XII", "Chapter twelve"],
    ["Apollo XIII", "Apollo thirteen"],
  ])("reads %s", (input, output) => expect(spokenText(input)).toBe(output));

  test.each(["Malcolm X", "the X's", "D.C.", "DC", "CD", "DVD", "MIX", "CIVIL", "MD", "LCD"])(
    "leaves %s alone",
    (text) => expect(spokenText(text)).toBe(text),
  );
});
