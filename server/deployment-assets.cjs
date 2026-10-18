function deploymentAssetBase(env) {
  if (env.VERCEL !== '1') return '/';
  const host = env.VERCEL_URL;
  if (typeof host !== 'string' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(host)) {
    throw new Error('A canonical Vercel deployment hostname is required for release assets.');
  }
  return `https://${host}/`;
}

module.exports = { deploymentAssetBase };
