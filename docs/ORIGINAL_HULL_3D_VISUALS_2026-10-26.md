# Original Hull 3D Visual Checks - Local Pass

## Changes

All fourteen travel-model classes now follow the intact original UI artwork's
main volumes and silhouette features: blunt rounded capital bows, heavy rear
bridges, fighter wings, stacked cargo, recycler drums, a colony habitat dome,
spherical probe/Deathstar and paired solar panel wings. These remain authored
low-poly interpretations of perspective images, not exact photogrammetry or
pixel-identical reconstructions.

The desktop comparison caught capital hulls that were still too flat. Replaced
the extruded capital plates with rounded volumetric hulls and shared panel
texturing. Raised the Deathstar aperture above the hull surface. Kept travel
heading, scale limits, return direction, route grouping and gameplay unchanged.

Detailed material batches are merged once per class. Distant versions retain
only silhouette-defining volumes: every class has fewer than 300 triangles in
its compact body and renders as two shared meshes. No per-vessel lights,
network loads, animation callbacks, geometry creation or material creation.

The DEV-only model review now includes the original artwork alongside each
model and orbit controls. Local URL: http://127.0.0.1:4197/fleet-assets.

## Browser Evidence

Chrome captured every detailed ship at measured CSS viewports 1280x900 and
390x844. Fourteen further captures cover mobile compact mode. Temporary
viewport overrides were reset afterward. Chrome's existing page zoom meant
requested viewport dimensions differed from actual CSS dimensions; the saved
DOM measurements, not requested values, define the reported test widths.

[Layout measurements for all 28 detailed checks](test-runs/original-hull-visuals-2026-10-26/layout.json).

[All 42 rendered-region pixel checks](test-runs/original-hull-visuals-2026-10-26/pixel-audit.json).

Every model was nonblank and framed clear of the canvas edges. Reference images
loaded for every detailed check; no horizontal overflow at either measured
width, and no mobile button/select/label extended beyond the viewport. Sampling
examines screenshot regions corresponding to the canvas, not direct GPU-buffer
readback; contact sheets were also visually inspected.

- [Desktop detailed contact sheet](test-runs/original-hull-visuals-2026-10-26/desktop-contact.png).
- [Mobile detailed contact sheet](test-runs/original-hull-visuals-2026-10-26/mobile-contact.png).
- [Mobile compact contact sheet](test-runs/original-hull-visuals-2026-10-26/mobile-compact-contact.png).
- [Rotation check](test-runs/original-hull-visuals-2026-10-26/motion-audit.json):
  1,363 sampled pixels changed between the two animated colony-ship captures.

Chrome occasionally timed out capturing background compositor frames. The
remaining captures succeeded after refreshing the test viewport; no security
settings or browser protections were bypassed. There were no observed game or
WebGL errors. Captured warnings came from the installed wallet extension.

This is desktop and emulated-mobile browser verification, not physical-device
testing, a live signed fleet mission or a live mainnet check.

## Regression Checks

39 tests passed, zero failures/skips: fleet assets, original volume landmarks,
compact triangle/mesh budgets, shared resource reuse, public entry, travel scene
motion, mission visibility/grouping and cargo handling.
[Regression log](test-runs/original-hull-regression-2026-10-26.log).

Final production TypeScript/Vite build passed, with existing bundler/chunk and
CryptoUfos mixed-import warnings:
[build log](test-runs/original-hull-model-build-2026-10-26.log).

No publication, deployment, authority changes, wallet operations, gameplay
spending or mainnet actions. Scheduled automation was left PAUSED.
