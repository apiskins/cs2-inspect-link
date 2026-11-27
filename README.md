# cs2-inspect-link

Read a CS2 inspect link: the float, pattern, stickers, charms and everything else it holds, straight from the link. No Steam account, no game coordinator, no requests.

One function, typed, no dependencies, Node.js 18+, Bun, Deno and browsers.

```sh
npm install cs2-inspect-link
```

## Usage

```ts
import { parse_inspect_link } from "cs2-inspect-link";

const item = parse_inspect_link("steam://run/730//+csgo_econ_action_preview%201808A8A2F8CC73001138AB1D301D281C20D6E1E2EF1B58F81D7A1D101B08C03C7086196810761E5AA1");

item.paint_wear; // 0.49753421545028687 (the float)
item.paint_seed; // 736 (the pattern)
item.stickers;   // [{ slot: 3, sticker_id: 4696, wear: null, ... }]
```

It takes the link as Steam gives it (with `%20`, `+` or a space before the data), or just the part after `csgo_econ_action_preview`.

## What comes back

```jsonc
{
  "type": "masked",               // "masked": the item is in the link; "classic": only ids
  "owner_steam_id": null,         // SteamID64, when the link says whose the item is
  "market_listing_id": null,      // classic market links (M...)
  "asset_id": "28900334896",
  "d": null,                      // classic links' D number
  "def_index": 9,                 // the weapon or item kind (9: AWP)
  "paint_index": 691,             // the finish
  "paint_wear": 0.49753421545028687,
  "paint_seed": 736,
  "rarity": 5,
  "quality": 4,                   // 4 normal, 9 StatTrak™, 12 Souvenir, ...
  "kill_eater_score_type": null,
  "kill_eater_value": null,       // StatTrak™ kills
  "custom_name": null,            // name tag
  "inventory": 158,
  "origin": 8,
  "quest_id": null,
  "drop_reason": null,
  "music_index": null,
  "ent_index": null,
  "pet_index": null,
  "stickers": [
    { "slot": 3, "sticker_id": 4696, "wear": null, "scale": null, "rotation": null, "tint_id": null,
      "offset_x": null, "offset_y": null, "offset_z": null, "pattern": null, "highlight_reel": null }
  ],
  "charms": []                    // same shape; a charm's id is in sticker_id, its pattern in pattern
}
```

Values are exactly what Valve puts in the link: numbers stay numbers, nothing is renamed into words. `paint_wear` is Valve's 32-bit float as is, so `0.49753421545028687` is exact; round it only for display. A field the item doesn't carry is `null`, never a guessed default, and `stickers` and `charms` are always arrays.

`null` is returned for anything that is not an inspect link, and for a masked link whose checksum fails (mistyped or cut off), so a damaged link never gives made-up values.

## Masked and classic links

- **Masked** links (what CS2 gives now): after `csgo_econ_action_preview` comes hex, the item's `CEconItemPreviewDataBlock` protobuf with a key byte and a checksum. Everything is read from it.
- **Classic** links (`S<steam id>A<asset id>D<number>`, or `M<listing id>A...D...` on the market) hold only ids. You get those, with the item fields `null`: the item itself can only be asked from Valve's game coordinator.

## Names, prices and whole inventories

The ids (`def_index`, `paint_index`, `sticker_id`) are Valve's. For names, prices and whole inventories:

- [Steam inventory API](https://apiskins.com/steam-inventory-api): any inventory by Steam ID or trade URL, every item with these same fields already read from its inspect link
- [CS2 price API](https://apiskins.com/price-api): every item's cheapest listing on each marketplace, with the [JavaScript client](https://github.com/apiskins/cs2-price-api)
- [Item API](https://apiskins.com/item-api): what every CS2 item is

## License

MIT
