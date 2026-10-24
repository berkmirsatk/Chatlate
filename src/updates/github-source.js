import { PLUGIN_VERSION } from '../identity.js';
import { isNewer, parseVersion } from './version.js';
import { installPackage } from './native-installer.js';
import { parseChangelog, telegramMarkdown } from './changelog.js';

const MAX_METADATA_CHARS = 128000;
export const MAX_PACKAGE_BYTES = 512 * 1024;

/** A public, unauthenticated release source. Private or unpublished repos return no update.
 * @param {string} repository
 * @returns {import('./index.js').ReleaseSource} */
export function createGitHubSource(repository) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('Invalid repository');
  const api = 'https://api.github.com/repos/' + repository;
  const web = 'https://github.com/' + repository;

  async function responseText(path, signal, accept = 'application/vnd.github+json') {
    if (signal.aborted) throw Error('Request cancelled');
    const response = await fetch(api + path, {
      headers: {
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        'Cache-Control': 'no-cache',
      },
      redirect: 'error',
      signal,
      timeout: 10000,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw Error('Release check failed');
    const text = await response.text();
    if (text.length > MAX_METADATA_CHARS) throw Error('Release metadata too large');
    return text;
  }

  async function metadata(path, signal) {
    const text = await responseText(path, signal);
    return text === null ? null : JSON.parse(text);
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

  return {
    async changelog(signal) {
      const text = await responseText(
        '/contents/CHANGELOG.md?ref=main',
        signal,
        'application/vnd.github.raw+json',
      );
      if (text === null || signal.aborted) throw Error('Changelog unavailable');
      return parseChangelog(text).map((entry) => ({
        version: entry.version,
        notes: { en: telegramMarkdown(entry.markdown) },
        url: web + '/releases/tag/v' + entry.version,
      }));
    },
    async check(signal) {
      const data = await metadata('/releases/latest', signal);
      const version = typeof data?.tag_name === 'string' ? data.tag_name.slice(1) : '';
      if (!parseVersion(version) || !isNewer(version, PLUGIN_VERSION) || !asset(data, version))
        return null;
      return { version, notes: {}, url: data.html_url };
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
