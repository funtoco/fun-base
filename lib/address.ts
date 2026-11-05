// 住所を「建物」と「部屋」に分ける（kintoneに依存しない純粋な関数）。
//
// 同じ建物かどうかは「都道府県＋市区町村＋町名＋番地（数字）」で決める。
// 建物名は書く人と書かない人がいるので、key には入れない（「A棟」「S7館」のような棟だけは入れる）。
// 例: 「4丁目1-17　ル号期2階北側」 → 番地 4-1-17 / 建物名 ル号期 / 部屋 2階北側
//     「2-37-306」               → 番地 2-37   / 部屋 306（3つ目が101以上なら部屋とみる）

const KANJI_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export type AddressParts = { pref?: string; city?: string; town?: string; street?: string; full?: string };
export type ParsedAddress = { key: string; nameKey: string; roomKey: string; head: string; town: string; banchi: string; name: string; room: string; address: string };

/** 「十二」→ 12（丁目の前の漢数字だけに使う。1〜99） */
function kanjiToNumber(s: string) {
  if (!s.includes('十')) return String(KANJI_DIGITS[s] ?? s);
  const [tens, ones] = s.split('十');
  return String((tens ? KANJI_DIGITS[tens] : 1) * 10 + (ones ? KANJI_DIGITS[ones] : 0));
}

/** 全角→半角、ハイフンのゆれをそろえ、スペースを1つにする */
export function normalize(s?: string | null): string {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[‐−–—―─]/g, '-')
    .replace(/(\d)\s*ー\s*(?=\d)/g, '$1-')
    .replace(/([一二三四五六七八九十]+)丁目/g, (_, k) => `${kanjiToNumber(k)}丁目`)
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 「4丁目1番17」「1132番地の1」「5-24号-501」→ ハイフンでつなぐ。最後の「番地」「番」「丁目」は消す */
function unifyBanchi(s: string): string {
  return s
    .replace(/丁日/g, '丁目')
    .replace(/(\d)\s*(?:丁目|丁|番地|番)?\s*の\s*(?=\d)/g, '$1-')
    .replace(/(\d)\s*(?:丁目|丁|番地|番)\s*-?\s*(?=\d)/g, '$1-')
    .replace(/(\d)\s*号\s*-\s*(?=\d)/g, '$1-')
    .replace(/(\d)\s*(?:丁目|番地|番)/g, '$1');
}

// 部屋の書き方（後ろにあるもの）。上から順にためす
// 頭のアルファベット（A301号室 の A）は、前が英字でないときだけ。数字は途中から取らない
const ROOM_HEAD = String.raw`(?:(?<![A-Za-z])[A-Z]\s*-?\s*)?(?<!\d)`;
const ROOM_AT_END = [
  /(\d+\s*(?:階|F)\D*)$/, // 2階東側 / 3F
  new RegExp(String.raw`(${ROOM_HEAD}\d+(?:-\d+)?\s*(?:号室|号|室))$`), // 301号 / 206号室 / A301号室 / KAGAWA307号室
  new RegExp(String.raw`(#?${ROOM_HEAD}\d{3,}(?:-\d+)?)$`), // 301 / B303 / A-303 / メゾンII303（数字だけなら3けた以上）
];
// 部屋が建物名より前に書いてあるとき（「203号室 サード・オーエム」）
const ROOM_ANYWHERE = new RegExp(String.raw`(${ROOM_HEAD}\d+\s*(?:号室|号|室))`, 'g');

/** 部屋の比べ方：「206号室」「206号」「206」、「A-303」「A303」は同じ */
const toRoomKey = (room: string) => room.replace(/^#/, '').replace(/[\s-]/g, '').replace(/(?:号室|号|室)$/, '').toUpperCase();

/** 建物名の前後のごみ（「. コーポ」「ウィステリア.」）をとる */
const cleanName = (name: string) => name.replace(/^[\s.,・、。-]+|[\s.,・、。-]+$/g, '');

/** key 用：スペース・「大字」「字」・ヶ/ケ のゆれをなくす */
const keyText = (s: string) => s.replace(/\s/g, '').replace(/大?字/g, '').replace(/[ヶヵ]/g, 'ケ');

/** 「大阪府豊中市豊南町西」→「豊南町西」（町名の項目がないとき用。だいたいでよい） */
function townFromHead(head: string): string {
  return head.replace(/^.+?[都道府県]/, '').replace(/^.+?[市区町村]/, '');
}

/** 部屋を建物名と分ける（rest は番地より後ろ） */
function splitRoom(rest: string): { room: string; name: string } {
  for (const re of ROOM_AT_END) {
    const r = rest.match(re);
    if (r) return { room: r[1].trim(), name: rest.slice(0, r.index) };
  }
  const all = [...rest.matchAll(ROOM_ANYWHERE)];
  if (all.length) {
    const r = all.at(-1)!;
    return { room: r[1].trim(), name: rest.slice(0, r.index!) + ' ' + rest.slice(r.index! + r[0].length) };
  }
  return { room: '', name: rest };
}

/**
 * @param {{pref?: string, city?: string, town?: string, street?: string, full?: string}} parts
 *   pref=都道府県, city=市区町村, town=町名, street=番地等, full=住所（ひとつながり）
 * @returns {{key: string, nameKey: string, roomKey: string, head: string, town: string, banchi: string, name: string, room: string, address: string}}
 *   key が '' なら住所なし。nameKey は「同じ町・同じ番地の頭・同じ建物名」なら同じ（番地の書きまちがいを救う用）
 */
export function parseAddress(parts: AddressParts): ParsedAddress {
  const pref = normalize(parts.pref);
  const city = normalize(parts.city);
  const town = normalize(parts.town);
  let street = normalize(parts.street);
  let head = (pref + city + town).replace(/\s/g, '');
  let townName = town;

  if (!street) {
    // 番地等が空なら、ひとつながりの住所を「最初の数字」の前後で分ける
    const full = normalize(parts.full).replace(/^(?:〒\s*)?\d{3}-?\d{4}\s*/, '');
    const i = full.search(/\d/);
    if (i >= 0) {
      head = full.slice(0, i).replace(/\s/g, '');
      street = full.slice(i);
      townName = townFromHead(head);
    }
  }

  const empty = { key: '', nameKey: '', roomKey: '', head, town: townName, banchi: '', name: '', room: '', address: head };
  // 町名までしかない（番地等が空）ときは、どの建物かわからないので「住所なし」にする
  if (!street) return empty;

  const originalStreetFromFirstNumber = street.slice(Math.max(street.search(/\d/), 0));
  const hasExplicitThreePartBanchi = /^\d+\s*(?:丁目|丁)\s*\d+\s*(?:番地|番)\s*\d+\s*号(?:\s|$)/.test(originalStreetFromFirstNumber);
  street = unifyBanchi(street).replace(/[()[\]「」]/g, ' ').replace(/\s+/g, ' ').trim();

  // 番地等の頭に町名・字が入っていることがある（「天王98-1」「大字中筋出作15-2」）
  const d = street.search(/\d/);
  if (d < 0) {
    // 番地を特定できない住所や「未定」などの仮入力は「住所の登録なし」にする
    return empty;
  }
  if (d > 0) {
    const prefix = street.slice(0, d).replace(/\s/g, '');
    head += prefix;
    townName += prefix;
    street = street.slice(d);
  }

  const m = street.match(/^(\d+(?:-\d+)*)(.*)$/);
  const nums = m![1].split('-');
  let rest = m![2];
  let banchiNums = nums;
  let roomNum = '';

  if (nums.length >= 4) {
    // 2-1-28-203号 → 番地 2-1-28 / 部屋 203号
    banchiNums = nums.slice(0, 3);
    roomNum = nums.slice(3).join('-');
  } else if (nums.length === 3 && Number(nums[2]) >= 101 && !hasExplicitThreePartBanchi) {
    // 2-37-306 → 番地 2-37 / 部屋 306（号が101以上になることはまずない）
    banchiNums = nums.slice(0, 2);
    roomNum = nums[2];
  } else if (/^\s*(?:号室|室)/.test(rest)) {
    // シエル207号室 → 部屋 207号室
    banchiNums = nums.slice(0, -1);
    roomNum = nums.at(-1) ?? '';
  }

  let room = '';
  let name;
  if (roomNum) {
    const suffix = rest.match(/^\s*(号室|号|室)/);
    room = roomNum + (suffix ? suffix[1] : '');
    rest = suffix ? rest.slice(suffix[0].length) : rest;
    name = rest;
  } else {
    rest = rest.replace(/^号(?!室)/, ''); // 1-2-3号 の「号」は住居表示
    ({ room, name } = splitRoom(rest.replace(/^[\s-]+/, '').trim()));
  }
  name = cleanName(name.replace(/\s+/g, ' '));

  const banchi = banchiNums.join('-');
  const keyHead = keyText(head);
  const wing = name.match(/([A-Za-z0-9]+|[一二三四五六七八九十]+)\s*(号館|棟|館)/); // 同じ番地に棟・号館がいくつもある
  const wingKey = wing ? `|${wing[1].toUpperCase()}${wing[2]}` : '';
  const nameText = keyText(name).toLowerCase();

  return {
    key: `${keyHead}|${banchi}${wingKey}`,
    nameKey: nameText.length >= 2 ? `${keyHead}|${banchiNums[0] ?? ''}|${nameText}` : '',
    roomKey: toRoomKey(room),
    head,
    town: townName,
    banchi,
    name,
    room,
    address: head + banchi,
  };
}
