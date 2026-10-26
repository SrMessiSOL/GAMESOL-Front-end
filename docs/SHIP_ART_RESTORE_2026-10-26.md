# Original Ship Artwork Restored Locally

Later local follow-up: [original-shape 3D models and desktop/mobile visual checks
now passed](ORIGINAL_HULL_3D_VISUALS_2026-10-26.md). The unverified-3D and browser
limitations below describe the earlier restoration checkpoint, not the current
follow-up result. Nothing has been published or deployed.

All fourteen catalog artwork imports now use the intact `src/assets/ui/`
originals, including the original `deathStar.webp` filename. Shared shipyard,
fleet, mission and public catalog art resolve through this catalog. The public
feature image uses the original battlecruiser as well. Generated replacement
art was preserved on disk, not deleted or overwritten.

Removed cutout padding, floating hover movement and the layered hangar image
from legacy background-image cards. Original scene images use contain framing.
Recent responsive layout and bounded mission artwork styles are retained.
No gameplay, program, authority, transaction or fleet routing changes.

Verification:
- Eight fleet asset tests passed, including all fourteen original file bindings,
  WebP validity, class coverage, bounded artwork and navigation geometry tests.
- Production build passed; log: `test-runs/original-ship-art-build-2026-10-26.log`.
- Chrome loaded all fourteen original images with positive natural dimensions.
  DOM layout showed no horizontal overflow at 2560px and 780px content widths.
- The requested 390px browser override produced a 780px content viewport;
  this is not a completed 390px mobile check. Override was reset.
- Screenshot capture timed out. A complete visual screenshot review is not
  claimed. Local review is available at http://127.0.0.1:4197/fleet-assets.

The 3D travel meshes are unchanged. They remain stylized models, not exact
reconstructions of the restored originals. A future 3D or raster restyling
must preserve each original hull's proportions, bow/stern, engine placement,
wing/outrigger layout and role-specific silhouette. This restoration does
not claim that remaining silhouette reconstruction is complete.

No publication/deployment or scheduled automation change.
