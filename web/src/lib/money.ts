/** A score as the TV shows it: "$1,200", "−$400". */
export function money(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
}
