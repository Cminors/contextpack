const ENGLISH_STOP_WORDS = new Set([
  "add",
  "and",
  "chore",
  "docs",
  "feat",
  "for",
  "from",
  "implement",
  "into",
  "new",
  "refactor",
  "test",
  "tests",
  "the",
  "this",
  "to",
  "update",
  "with",
]);

const CHINESE_STOP_WORDS = new Set(["一个", "以及", "功能", "增加", "新增", "模块", "支持", "现有"]);

const TERM_ALIASES: Record<string, string[]> = {
  builds: ["build"],
  commonjs: ["cjs"],
  discovery: ["metadata"],
  hosts: ["host"],
  oauth: ["auth", "authorization"],
  packages: ["package"],
  schemas: ["schema"],
  登录: ["auth", "authenticate", "authentication", "login", "signin"],
  用户: ["account", "profile", "user"],
  支付: ["billing", "checkout", "payment"],
  导出: ["download", "export"],
  筛选: ["filter", "query"],
  搜索: ["find", "search"],
  上传: ["attachment", "upload"],
  通知: ["notification", "notify"],
  权限: ["access", "permission", "role"],
};

function splitCamelCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function cjkTerms(value: string): string[] {
  const matches = value.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  const terms = new Set<string>();

  for (const match of matches) {
    if (!CHINESE_STOP_WORDS.has(match)) {
      terms.add(match);
    }
    for (let index = 0; index < match.length - 1; index += 1) {
      const bigram = match.slice(index, index + 2);
      if (!CHINESE_STOP_WORDS.has(bigram)) {
        terms.add(bigram);
      }
    }
  }

  return [...terms];
}

export function extractConventionalScope(task: string): string | null {
  const match = task.match(/^(?:feat|feature|fix|docs|chore|refactor|test)\(([^)]+)\)!?:/i);
  return match?.[1]?.normalize("NFKC").toLowerCase().trim() || null;
}

export function normalizeTaskTerms(task: string): string[] {
  const cleanedTask = task
    .replace(
      /^(?:feat|feature|fix|docs|chore|refactor|test)(?:\(([^)]*)\))?!?:\s*/i,
      (_match, scope: string | undefined) => scope ? `${scope} ` : "",
    )
    .replace(/\(?#\d+\)?/g, " ");
  const expanded = splitCamelCase(cleanedTask)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ");
  const terms = new Set<string>();

  for (const term of expanded.split(/\s+/)) {
    if (term.length >= 2 && !ENGLISH_STOP_WORDS.has(term) && !CHINESE_STOP_WORDS.has(term)) {
      terms.add(term);
    }
  }

  for (const term of cjkTerms(expanded)) {
    terms.add(term);
  }

  for (const [source, aliases] of Object.entries(TERM_ALIASES)) {
    if (terms.has(source) || cleanedTask.includes(source)) {
      aliases.forEach((alias) => terms.add(alias));
    }
  }

  return [...terms].sort();
}

export function lexicalMatch(terms: string[], text: string): number {
  if (terms.length === 0 || text.length === 0) {
    return 0;
  }

  const normalized = splitCamelCase(text).normalize("NFKC").toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (normalized.includes(term)) {
      hits += 1;
    }
  }

  return Math.min(1, hits / Math.max(2, Math.min(terms.length, 6)));
}
