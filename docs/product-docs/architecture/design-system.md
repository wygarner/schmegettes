# Design System

One component library for product UI and prototypes: **Mantine 9**. Prototypes in `devtools/src/designs/` and production code in `web/` use the same theme values, so a prototype looks like the real thing.

## Theme

```ts
{
  primaryColor: "boardBlue",
  colors: {
    boardBlue: ["#e8eaff", "#c9cdf7", "#a5abee", "#7f87e6", "#5f68df", "#4a53da", "#3f48d9", "#3139c1", "#2932ad", "#060ce9"],
  },
  fontFamily: "Inter, system-ui, sans-serif",
  headings: { fontFamily: "Oswald, Impact, sans-serif" },
}
```

Default color scheme: dark.

| Element | Treatment |
|---|---|
| Board cell | `boardBlue.9` background, value in `yellow.4`, weight 800 |
| Category header | `boardBlue.9`, white, uppercase, weight 700 |
| Correct / incorrect | Mantine `green` / `red` |
| Buzzer | One `Buzzer` component in every view (phone and host device). Full width of its container, at least 64 px tall |
| Picking player | Their score tile gets a 3 px `yellow.4` border and a "PICKING" label |
| Host screen | Designed for an iPhone in landscape: 844 × 390 target, no scrolling from 667 × 320, inside safe-area insets |

`/product` and `/designer` refine this file; `web/src/main.tsx` is the source of truth for the values.
