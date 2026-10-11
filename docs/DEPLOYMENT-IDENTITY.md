# GAMESOL Passkey Frontend

This checkout contains the LazorKit frontend and enhanced planet/universe graphics.

- GitHub repository: https://github.com/SrMessiSOL/GAMESOL-Front-end
- Backup branch: `backup/passkey-universe-2026-10-11`
- Vercel project: `frontend` in `srmessisols-projects`
- Existing production deployment: `frontend-msbf3bu2h-srmessisols-projects.vercel.app`
- Project URL: https://frontend-alpha-ashy-20.vercel.app
- Official game URL: https://chained-universe.vercel.app

The existing production deployment was created on September 3, 2026. Local
commits include subsequent interface improvements and must not be assumed to
be deployed simply because the official URL points to this Vercel project.

The older `chained-universe` Vercel project and GitHub `main` contain the
extension-wallet frontend. Preserve them for rollback. Publishing this backup
branch does not replace GitHub `main` or connect automatic deployments.

The official URL is an alias of the existing passkey deployment. Verify it
after future deployments, and migrate the project connection deliberately
before treating GitHub pushes as automatic production releases.

Runtime configuration belongs in Vercel environment settings or ignored local
environment files. Never commit signing keys or private RPC credentials.
