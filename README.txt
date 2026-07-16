MKWii Channel — upgraded build
================================

What changed vs. your original file:
- Added a subtle canvas-based "warp field" (rushing streak lines, Rainbow-Road style) behind the whole page.
- Added a soft cursor-following glow (desktop with a mouse only).
- Added real-time 3D pointer tilt to the live-preview screenshots, the feature cards, and the CTA buttons.
- All of it respects prefers-reduced-motion and is automatically disabled on touch devices, so it never gets in the way on mobile.
- No existing markup, links, or classes were removed — only additive CSS/JS, so your layout, Discord link, and footer credit are untouched.

You still need to drop your own image assets into this folder exactly as before, since they weren't part of the file I was given:
- ui_1.png              (nav logo, referenced at the site root)
- ctgpr-icon.png        (footer icon, referenced at the site root)
- images/preview-desktop.png
- images/preview-mobile.png
- images/preview-desktop-mobile.png
- images/preview-mobile-mobile.png

Just open index.html once those images are in place — everything else (fonts, effects, links) works out of the box, no build step needed.
