const BRAND_ALIASES: Record<string, string[]> = {
  goodwe: ["goodwe", "goodwee", "good-we", "good wee"],
  fox: ["fox", "foxess", "fox ess", "fox-ess"],
  solis: ["solis"],
  kstar: ["kstar", "k-star", "k star"],
  itel: ["itel", "i-tel", "i tel"],
  photon: ["photon"],
  pylontech: ["pylontech", "pylon tech", "pylon-tech"],
  dyness: ["dyness"],
  livoltek: ["livoltek", "livoltech"],
  inverex: ["inverex"],
  growatt: ["growatt"],
  huawei: ["huawei"],
  saj: ["saj"],
  soluna: ["soluna"],
  longi: ["longi", "longi solar"],
  aiko: ["aiko", "aiko solar"],
  ja: ["ja", "ja solar", "jasolar"],
  astro: ["astro", "astro energy", "astro solar"],
  canadian: ["canadian", "canadian solar", "canadiansolar"],
  jinko: ["jinko", "jinko solar", "jinkosolar"],
};

const BRAND_DISPLAY_NAMES: Record<string, string> = {
  goodwe: "GoodWe",
  fox: "Fox",
  solis: "Solis",
  kstar: "KSTAR",
  itel: "Itel",
  photon: "Photon",
  pylontech: "Pylontech",
  dyness: "Dyness",
  livoltek: "Livoltek",
  inverex: "Inverex",
  growatt: "Growatt",
  huawei: "Huawei",
  saj: "SAJ",
  soluna: "Soluna",
  longi: "Longi",
  aiko: "AIKO",
  ja: "JA Solar",
  astro: "Astro",
  canadian: "Canadian Solar",
  jinko: "Jinko Solar",
};

const compactBrand = (value?: string | null) => (value ?? "")
  .toLowerCase()
  .trim()
  .replace(/[\s_-]+/g, "")
  .replace(/[^a-z0-9]/g, "");

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }

  return previous[right.length];
}

function fuzzyBrandMatches(value: string, target: string) {
  const longest = Math.max(value.length, target.length);
  const shortest = Math.min(value.length, target.length);
  if (shortest < 5) return false;
  const allowedDistance = longest > 5 ? 2 : 1;
  return levenshteinDistance(value, target) <= allowedDistance;
}

export function normalizeBrandName(value?: string | null) {
  const compact = compactBrand(value);
  if (!compact) return "";

  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    if (compact === canonical || aliases.some((alias) => compact === compactBrand(alias))) {
      return canonical;
    }
  }

  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    const candidates = [canonical, ...aliases].map(compactBrand).filter((candidate) => candidate.length >= 4);
    if (candidates.some((candidate) => compact.startsWith(candidate) || compact.endsWith(candidate))) {
      return canonical;
    }
  }

  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    const candidates = [canonical, ...aliases].map(compactBrand);
    if (candidates.some((candidate) => fuzzyBrandMatches(compact, candidate))) {
      return canonical;
    }
  }

  return compact;
}

export function brandMatches(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeBrandName(left);
  const normalizedRight = normalizeBrandName(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function displayBrandName(value?: string | null) {
  const normalized = normalizeBrandName(value);
  return BRAND_DISPLAY_NAMES[normalized] ?? (value?.trim() || "Unknown brand");
}
