/**
 * robots.txt (RFC 9309) evaluation for one product token, group-aware: the groups naming the
 * token (case-insensitive) apply; otherwise the "*" groups. Several matching groups combine.
 * Longest matching rule wins; Allow wins a tie; `*` wildcard and `$` anchor are supported.
 */

export interface RobotsVerdict {
  allowed: boolean;
  /** The group that applied ("autokeepbot" / "*") or null when no group applies. */
  group: string | null;
  /** The deciding rule, e.g. "Disallow: /manuals/" — null when no rule matched (allowed). */
  rule: string | null;
}

function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
}

interface Group {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if ((key === 'allow' || key === 'disallow') && val) {
      current.rules.push({ allow: key === 'allow', path: val });
    }
  }
  return groups;
}

export function robotsVerdict(text: string, token: string, pathAndQuery: string): RobotsVerdict {
  const groups = parseRobots(text);
  const t = token.toLowerCase();
  let applicable = groups.filter((g) => g.agents.includes(t));
  let group: string | null = applicable.length ? t : null;
  if (!applicable.length) {
    applicable = groups.filter((g) => g.agents.includes('*'));
    group = applicable.length ? '*' : null;
  }
  let best: { len: number; allow: boolean; path: string } | null = null;
  for (const g of applicable) {
    for (const r of g.rules) {
      if (!ruleMatches(r.path, pathAndQuery)) continue;
      const len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) {
        best = { len, allow: r.allow, path: r.path };
      }
    }
  }
  return {
    allowed: best ? best.allow : true,
    group,
    rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null,
  };
}
