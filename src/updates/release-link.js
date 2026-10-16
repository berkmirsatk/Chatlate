/** Keep the release action on GitHub and on the selected version's tag page.
 * @param {import('./index.js').Release} release */
export function githubReleaseUrl(release) {
  if (typeof release.url !== 'string') return undefined;
  const match =
    /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/releases\/tag\/v?(\d+\.\d+\.\d+)$/.exec(
      release.url,
    );
  return match?.[1] === release.version ? release.url : undefined;
}
