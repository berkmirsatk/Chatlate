import { isNewer, parseVersion } from './version.js';

/** Parse stable-version sections from the shared CHANGELOG.md, outside fenced code.
 * @param {string} markdown @returns {{version: string, markdown: string}[]} */
export function parseChangelog(markdown) {
  if (typeof markdown !== 'string' || markdown.length > 128000)
    throw Error('Invalid changelog size');
  const entries = [],
    seen = new Set();
  let current, fence;
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
        fence = undefined;
      current?.lines.push(line);
      continue;
    }
    if (!fence && /^##\s/.test(line)) {
      const version = /^##\s+v?(\d+\.\d+\.\d+)\s*$/.exec(line)?.[1];
      current = undefined;
      if (version && parseVersion(version)) {
        if (seen.has(version)) throw Error('Duplicate changelog version');
        seen.add(version);
        current = { version, lines: [] };
        entries.push(current);
      }
    } else current?.lines.push(line);
  }
  return entries
    .map((entry) => ({ version: entry.version, markdown: entry.lines.join('\n').trim() }))
    .sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1));
}

/** Telegram's Markdown subset uses bold lines for GitHub headings.
 * @param {string} markdown */
export function telegramMarkdown(markdown) {
  let fence;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
          fence = undefined;
        return line;
      }
      return fence ? line : line.replace(/^#{1,6}\s+(.+)$/, '**$1**');
    })
    .join('\n');
}
