# Approved hero asset

APPROVED HERO ASSET REQUIRED

No exact approved standalone Makkah / Masjid al-Haram / Kaaba asset was found. Searches covered canonical, frontend and backend worktree asset directories, existing UI/UX documents, attachment references and the existing generated-image directory for task 01a0af4e-62cc-7461-850e-e28ff1e74be1. The generated files are full UI composition mockups; they are not an approved standalone hero photograph. No mockup was cropped or substituted as the approved asset.

Expected source: `apps/web/public/images/hero/makkah-approved.webp`.
Expected public URL: `/images/hero/makkah-approved.webp`.
Recommended specification: exact approved landscape image, 1800–2400px wide, 3:2 or 16:10, optimized WebP targeting ≤350KB. Preserve the Kaaba focal point and surrounding space. Record provenance and whether generated/illustrative here when supplied.

`app/page.tsx` detects the file at build time and renders a reserved 3:2 right-column figure using Next Image, responsive sizes, priority loading and object-contain. Text remains in a separate column. The existing ecosystem composition remains when absent; there is no image request or broken placeholder. Add the asset and rebuild to activate it.

Current hero/layout checked at 1440, 1280, 768, 390 and 360px. Image focal point, exact-image visual balance and final compressed image weight cannot be accepted until the approved file exists. This is the explicitly allowed approved-asset exception, not a claim that the photograph is implemented.
