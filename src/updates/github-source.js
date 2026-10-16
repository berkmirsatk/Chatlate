import { PLUGIN_VERSION } from '../identity.js';
import { isNewer, parseVersion } from './version.js';
import { installPackage } from './native-installer.js';

const MAX_METADATA_CHARS = 128000;
export const MAX_PACKAGE_BYTES = 512 * 1024;

/** A public, unauthenticated release source. Private or unpublished repos return no update.
 * @param {string | null} repository
 * @returns {import('./index.js').ReleaseSource | null} */
export function createGitHubSource(repository) {
  if (!repository) return null;
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('Invalid repository');
  const api = 'https://api.github.com/repos/' + repository;
  const web = 'https://github.com/' + repository;

  async function metadata(path, signal) {
    const response = await fetch(api + path, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error',
      signal,
      timeout: 10000,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw Error('Release check failed');
    const text = await response.text();
    if (text.length > MAX_METADATA_CHARS) throw Error('Release metadata too large');
    return JSON.parse(text);
  }

  function asset(data, version) {
    if (
      data?.draft ||
      data?.prerelease ||
      data?.tag_name !== 'v' + version ||
      data?.html_url !== web + '/releases/tag/v' + version ||
      !Array.isArray(data?.assets)
    )
      return null;
    const matches = data.assets.filter((file) => file.name === `Chatlate-${version}.inu.js`);
    const file = matches.length === 1 ? matches[0] : null;
    return file &&
      Number.isSafeInteger(file.id) &&
      file.id > 0 &&
      Number.isSafeInteger(file.size) &&
      file.size > 0 &&
      file.size <= MAX_PACKAGE_BYTES &&
      /^sha256:[a-f0-9]{64}$/.test(file.digest)
      ? file
      : null;
  }

  /** Keep GitHub headings readable in Telegram's supported Markdown subset. */
  function notes(body) {
    if (typeof body !== 'string') return '';
    let fenced = false;
    return body
      .split('\n')
      .map((line) => {
        if (/^\s*```/.test(line)) {
          fenced = !fenced;
          return line;
        }
        return fenced ? line : line.replace(/^#{1,6}\s+(.+)$/, '**$1**');
      })
      .join('\n');
  }

  return {
    async check(signal) {
      const data = await metadata('/releases/latest', signal);
      const version = typeof data?.tag_name === 'string' ? data.tag_name.slice(1) : '';
      if (!parseVersion(version) || !isNewer(version, PLUGIN_VERSION) || !asset(data, version))
        return null;
      return { version, notes: { en: notes(data.body) }, url: data.html_url };
    },
    async install(release, signal) {
      if (signal.aborted) throw Error('Update cancelled');
      if (!parseVersion(release.version) || !isNewer(release.version, PLUGIN_VERSION))
        throw Error('Invalid release version');
      // Re-read the selected tag so stale UI data cannot choose a URL or package.
      const data = await metadata('/releases/tags/v' + release.version, signal);
      const file = asset(data, release.version);
      if (!file || signal.aborted) throw Error('Release unavailable');
      const response = await fetch(api + '/releases/assets/' + file.id, {
        headers: { Accept: 'application/octet-stream' },
        redirect: 'follow',
        signal,
        timeout: 25000,
      });
      if (
        !response.ok ||
        !/^https:\/\/(api\.github\.com|release-assets\.githubusercontent\.com)\//.test(response.url)
      ) {
        throw Error('Package download failed');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (signal.aborted || bytes.length !== file.size || bytes.length > MAX_PACKAGE_BYTES)
        throw Error('Invalid package size');
      installPackage(bytes, file.digest.slice(7), release.version, signal);
    },
  };
}
