export type InspectSticker = {
    slot: number;
    sticker_id: number;
    wear: number | null;
    scale: number | null;
    rotation: number | null;
    tint_id: number | null;
    offset_x: number | null;
    offset_y: number | null;
    offset_z: number | null;
    pattern: number | null;
    highlight_reel: number | null;
};

export type InspectLink = {
    type: "masked" | "classic";
    owner_steam_id: string | null;
    market_listing_id: string | null;
    asset_id: string | null;
    d: string | null;
    def_index: number | null;
    paint_index: number | null;
    paint_wear: number | null;
    paint_seed: number | null;
    rarity: number | null;
    quality: number | null;
    kill_eater_score_type: number | null;
    kill_eater_value: number | null;
    custom_name: string | null;
    inventory: number | null;
    origin: number | null;
    quest_id: number | null;
    drop_reason: number | null;
    music_index: number | null;
    ent_index: number | null;
    pet_index: number | null;
    stickers: InspectSticker[];
    charms: InspectSticker[];
};

type Field = { number: number; varint?: bigint; fixed32?: number; bytes?: Uint8Array };

const STEAM_ID_BASE = 76561197960265728n;
const PREVIEW = "csgo_econ_action_preview";

function read_fields(bytes: Uint8Array) {
    const fields: Field[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 0;

    const varint = () => {
        let value = 0n;
        let shift = 0n;

        while (true) {
            if (at >= bytes.length || shift > 63n) throw new Error("cut off");

            const byte = bytes[at++];

            value |= BigInt(byte & 0x7f) << shift;
            shift += 7n;

            if ((byte & 0x80) === 0) return value;
        }
    };

    const skip = (length: number) => {
        if (at + length > bytes.length) throw new Error("cut off");
        at += length;
    };

    while (at < bytes.length) {
        const tag = Number(varint());
        const number = tag >>> 3;
        const wire = tag & 7;

        if (number === 0) throw new Error("bad field");

        if (wire === 0) {
            fields.push({ number, varint: varint() });
        } else if (wire === 5) {
            skip(4);
            fields.push({ number, fixed32: view.getFloat32(at - 4, true) });
        } else if (wire === 1) {
            skip(8);
        } else if (wire === 2) {
            const length = Number(varint());

            skip(length);
            fields.push({ number, bytes: bytes.subarray(at - length, at) });
        } else {
            throw new Error("bad wire type");
        }
    }

    return fields;
}

const varint_of = (fields: Field[], number: number) => fields.find(field => field.number === number)?.varint;

const int_of = (fields: Field[], number: number) => {
    const value = varint_of(fields, number);

    return value === undefined ? null : Number(value);
};

const float_of = (fields: Field[], number: number) => fields.find(field => field.number === number)?.fixed32 ?? null;

// the float comes as a varint holding a float32's bits
function wear_of(fields: Field[]) {
    const bits = varint_of(fields, 7);

    if (bits === undefined) return null;

    const view = new DataView(new ArrayBuffer(4));

    view.setUint32(0, Number(bits & 0xffffffffn), true);

    return view.getFloat32(0, true);
}

function sticker_of(fields: Field[]): InspectSticker {
    return {
        slot: int_of(fields, 1) ?? 0,
        sticker_id: int_of(fields, 2) ?? 0,
        wear: float_of(fields, 3),
        scale: float_of(fields, 4),
        rotation: float_of(fields, 5),
        tint_id: int_of(fields, 6),
        offset_x: float_of(fields, 7),
        offset_y: float_of(fields, 8),
        offset_z: float_of(fields, 9),
        pattern: int_of(fields, 10),
        highlight_reel: int_of(fields, 11),
    };
}

const crc_table = Array.from({ length: 256 }, (_, n) => {
    let c = n;

    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;

    return c >>> 0;
});

function crc32(bytes: Uint8Array) {
    let c = 0xffffffff;

    for (const byte of bytes) c = crc_table[(c ^ byte) & 0xff] ^ (c >>> 8);

    return (c ^ 0xffffffff) >>> 0;
}

const no_item = {
    def_index: null,
    paint_index: null,
    paint_wear: null,
    paint_seed: null,
    rarity: null,
    quality: null,
    kill_eater_score_type: null,
    kill_eater_value: null,
    custom_name: null,
    inventory: null,
    origin: null,
    quest_id: null,
    drop_reason: null,
    music_index: null,
    ent_index: null,
    pet_index: null,
};

// [key][protobuf][checksum], everything after the key XOR'd with it
function parse_masked(hex: string): InspectLink | null {
    if (hex.length % 2 !== 0 || hex.length < 12) return null;

    const raw = new Uint8Array(hex.length / 2);

    for (let i = 0; i < raw.length; i++) raw[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

    const key = raw[0];
    const plain = raw.map((byte, i) => (i === 0 ? byte : byte ^ key));
    const proto = plain.subarray(1, plain.length - 4);
    const tail = plain.subarray(plain.length - 4);

    const crc = crc32(plain.subarray(0, plain.length - 4));
    const checksum = ((crc & 0xffff) ^ Math.imul(proto.length, crc)) >>> 0;

    if (checksum !== ((tail[0] << 24) | (tail[1] << 16) | (tail[2] << 8) | tail[3]) >>> 0) return null;

    let fields: Field[];

    try {
        fields = read_fields(proto);
    } catch {
        return null;
    }

    const stickers_of = (number: number) => {
        try {
            return fields.filter(field => field.number === number && field.bytes).map(field => sticker_of(read_fields(field.bytes!)));
        } catch {
            return [];
        }
    };

    const account_id = varint_of(fields, 1);
    const item_id = varint_of(fields, 2);
    const name = fields.find(field => field.number === 11)?.bytes;

    return {
        type: "masked",
        owner_steam_id: account_id ? String(STEAM_ID_BASE + account_id) : null,
        market_listing_id: null,
        asset_id: item_id === undefined ? null : String(item_id),
        d: null,
        def_index: int_of(fields, 3),
        paint_index: int_of(fields, 4),
        paint_wear: wear_of(fields),
        paint_seed: int_of(fields, 8),
        rarity: int_of(fields, 5),
        quality: int_of(fields, 6),
        kill_eater_score_type: int_of(fields, 9),
        kill_eater_value: int_of(fields, 10),
        custom_name: name ? new TextDecoder().decode(name) : null,
        inventory: int_of(fields, 13),
        origin: int_of(fields, 14),
        quest_id: int_of(fields, 15),
        drop_reason: int_of(fields, 16),
        music_index: int_of(fields, 17),
        ent_index: int_of(fields, 18),
        pet_index: int_of(fields, 19),
        stickers: stickers_of(12),
        charms: stickers_of(20),
    };
}

export function parse_inspect_link(link: string): InspectLink | null {
    if (typeof link !== "string") return null;

    let text = link.trim();

    try {
        text = decodeURIComponent(text);
    } catch {}

    const at = text.indexOf(PREVIEW);
    const payload = (at === -1 ? text : text.slice(at + PREVIEW.length)).replace(/^[\s+]+/, "").trim();
    const classic = /^([SM])(\d+)A(\d+)D(\d+)$/i.exec(payload);

    if (classic) {
        const [, kind, id, asset_id, d] = classic;
        const market = kind.toUpperCase() === "M";

        return {
            type: "classic",
            owner_steam_id: market ? null : id,
            market_listing_id: market ? id : null,
            asset_id,
            d,
            ...no_item,
            stickers: [],
            charms: [],
        };
    }

    return /^[0-9a-f]+$/i.test(payload) ? parse_masked(payload) : null;
}
