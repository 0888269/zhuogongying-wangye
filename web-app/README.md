# 医工名片

Personal NFC profiles, badges, account editing, and association administration.

## Assessment and improvements

The original app had mismatched login/public-profile styles, a narrow fixed card layout, limited keyboard access, no login pending state, and unreliable save feedback. More serious issues were unvalidated login tokens, unprotected write/admin endpoints, public serving of the entire repository, hardcoded database/OAuth credentials, and unsafe public-profile script/badge interpolation.

This update adds a shared responsive visual system using the club logo and its blue-to-purple palette, a split login layout, native form submission and autofill, password visibility, caps-lock hints, pending/error feedback, keyboard-operable controls, a local avatar fallback, and mobile-friendly public profiles. Profile changes are committed to the local cache only after the server confirms success.

Server improvements include random expiring sessions, ownership/admin checks, session revocation on logout, login request validation and throttling, allowlisted static assets, safe serialization of public-profile data, and one-time expiring OAuth state. Cached/exported passwords are removed.

## Run

Install dependencies with `npm ci`. Set the variables listed in `.env.example` in your shell or service manager, then run `npm start`. The application does not automatically load `.env` files. MySQL must already contain the schema from `database.sql`; startup migrations still run as before.

PowerShell example:

```powershell
$env:DB_PASSWORD = '<your database password>'
$env:FEISHU_APP_ID = '<your app ID>'
$env:FEISHU_APP_SECRET = '<your app secret>'
npm start
```

Feishu binding is unavailable until its app credentials and redirect URL are configured. Existing credentials that were committed in source should be rotated. Existing databases keep their passwords; the original empty-database bootstrap still creates sample accounts with password `123456`, so change these before public use.

The old AES key has an invalid byte length. The fallback now derives a deterministic 32-byte key so NFC sharing works. A configured `ENCRYPTION_KEY` must have exactly 32 UTF-8 bytes. Keep it stable: changing it invalidates generated NFC URLs.

Sessions are stored in process memory, expire after eight hours, and reset on server restart. Multi-instance deployments need shared session storage. Serve traffic over HTTPS. If a separate web server serves the repository directly, configure it to expose only the intended public HTML/CSS/JS/SVG assets; Express restrictions do not protect that separate server.

## Verification

`npm test` runs isolated integration checks with fixture database responses and the real bcrypt library. It does not connect to or change MySQL. Tests cover login validation, authorization, ownership, logout, private-file restrictions, OAuth state rejection, public NFC profile rendering, injection escaping, and inline script syntax.

Browser checks used fixture profiles to verify desktop/mobile layouts, password visibility, invalid-login feedback, and successful login. Real MySQL persistence, Feishu binding, physical NFC hardware, and deployment routing require configured services.

## Remaining work

The legacy account/admin code still mixes inline markup, local caching, and imperative rendering. Some administrator-only HTML builders need further input escaping and validation; the JSON/CSV importer also deserves transaction and validation work. A future refactor should separate views and data access and replace sample bootstrap credentials. This update is an improvement pass, not a complete production security audit.

## Removed unused files

Removed `node_modules.zip` (duplicate dependency archive), `encrypt-tool.html` (unused standalone helper using incompatible client-side encryption), `data.json` and `test.json` (unreferenced legacy JSON snapshots; the application uses MySQL), the blank `.htaccess`, and the PHP-only `.user.ini`. Removed the dead JSON read/write functions from `server.js`. Kept `database.sql`, the lockfile, dependencies, regression tests, and `.well-known` certificate validation files.

## Member dashboard and NFC direction

The login labels, help text, and controls use larger type. The signed-in view now has a responsive light dashboard, a profile hero, live badge count, labelled edit/password actions, public-card preview, and persistent-link copying. Status feedback is visible, and failed saves keep the editor open.

NFC architecture was not changed in this UI update. `/user/:encryptedUserId` already serves the public profile directly. For a future iteration, use a stable short random card identifier mapped to the current profile, with a QR code fallback and explicit card revocation/replacement. Keep existing NFC URLs valid during migration. Web NFC can provide optional in-page scanning on supported Android browsers but cannot serve as the universal entry path. Physical NFC hardware and native-app deep linking remain untested.

## Mobile growth route and badge wall

The member interface has three tabs: profile, growth route, and badge wall. Growth uses a vertical, expandable route based on the supplied 卓越工程师等级标准 chart. There are six stages and 42 tasks. Only the current stage expands by default. On phones, the profile header becomes compact while viewing progression. The wall shows stage-filtered task medals and four cumulative rank medals, with dimmed incomplete medals and illuminated approved medals. Existing association course/activity awards and growth task badges now share one 卓越图鉴 collection, one counter, and one set of filters. Earned badges appear first; the initial wall displays 12 items with a control to expand the collection. Award dates and administrator management are preserved. Association awards do not automatically complete growth tasks.

Task evidence follows **member submission → administrator review → badge illumination**. Members open a task and submit 10–2000 characters of completion evidence, including optional links. Pending tasks do not unlock badges. Administrators use the new review panel under the administrator tab; they approve or return submissions with feedback. Returned tasks can be resubmitted. Approved tasks cannot be overwritten by a member, and stale review actions cannot overwrite a completed decision. Refresh progress to see approvals without logging in again.

The `growth_submissions` MySQL table stores submission status, evidence, review notes, submit/review times, and reviewer ID. Startup creates the table automatically once the database is connected; its schema is also included in `database.sql`. The account API carries private progress only for the member or administrator. Public NFC profiles show approved tasks, completion dates, and the badge wall; pending work, evidence, and review feedback remain private.

Task names and criteria are maintained in `growth-catalog.js`. Rank criteria interpret the provided diagram cumulatively: 初级 requires all 初阶 tasks, 中级 all tasks through 中阶, 高级 all tasks through 常规产品 (including two product outcomes, service, and multidimensional ability), and 卓越 all tasks through 创新产品/创业 (including important-project leadership and association management). These are configurable club rules, not externally issued certifications. Legacy badges are not inferred to mean a growth task is complete; members submit evidence for review.

New files: `growth-catalog.js` shares deterministic stage/rank rules between server and browser, `growth-service.js` owns persistence and permission-checked APIs, and `growth-ui.js` / `growth.css` render the route, badge wall, bottom sheets, and review panel. Profile edits by ordinary members cannot award legacy badges either; those remain administrator-managed.

`npm test` runs 29 checks. Growth tests cover task identifiers, cumulative rank rules, ownership, member submissions, admin approval, rejection/resubmission, stale decisions, and public evidence privacy. Real-browser checks verify the complete submission-to-approval-to-illuminated-badge flow, accessible dialogs, six stages/42 tasks, and 320px/390px layouts without runtime exceptions. Screenshots use isolated sample progress. Real MySQL persistence and physical NFC hardware have not been exercised in this environment.

## Sculpted medals and submission repair

`medal-art.js` renders original SVG ceremonial orders with ribbons, engraved radial rays, enamel centres, metallic highlights, and shadows. These are vector graphics with a dimensional appearance, not a WebGL 3D renderer. The mobile badge wall is a woven navy display cabinet with larger medals and engraved separators. Approved medals reveal their metal/enamel finish; unfinished medals remain dark.

Growth requests use `api-client.js` instead of blindly parsing every response with `response.json()`. Missing routes, proxy HTML pages, malformed responses, offline errors, and API error messages produce readable feedback and preserve the open submission draft. Express now returns JSON for missing API endpoints and malformed request bodies. If a running deployment still returns HTML for the growth endpoints, update/restart its backend and check its reverse-proxy API routing; a frontend cannot create a missing remote endpoint.

The evidence field is explicitly full width, at least 190px tall, and auto-expands up to 380px. It supports 10–2000 characters, multiline text, and long URLs, with a live character counter. The 10-character limit is a minimum requirement, not a maximum. Browser verification used hundreds of characters inserted through the browser input API and confirmed there was no horizontal overflow or truncation. It also simulated an HTML 404, confirmed the full draft survived, and then verified successful submission and approval.

Validation: 24 automated tests pass; browser checks pass at 320px and 390px without runtime exceptions. The production/deployed proxy and database have not been changed or verified.

The visual system uses restrained Arknights-inspired etched geometry: original silver hexagonal insignia, graphite collection panels, angular profile sections, and blue/purple club accents. Ornate generated medals are not used. The rank strip scrolls horizontally on phones. Both account and public profiles use the same collection renderer; the duplicate legacy galleries and their render/toggle code have been removed.

## Administrator badge workshop

The administrator tab includes a searchable badge workshop. Administrators can create association awards and edit their names/symbols globally; updates preserve each member's earned state and award date. New awards are assigned locked to all existing members; new accounts inherit them through the existing award-template flow. Awarding association badges remains in member management. Administrators can also edit the name, symbol, and completion requirements of the 42 growth badges. Their stable task IDs, submissions, and approvals remain intact. Changes to criteria apply to future reviews without revoking existing approvals. Growth overrides persist in `growth_badge_definitions`, created at startup and included in `database.sql`. Member and public profile responses carry the overrides, so edited names appear consistently on the route and wall.

`tests/badges.test.js` checks administrator permissions, creation, collision/validation handling, preservation of dates/unlocks, and propagation of edited growth definitions without exposing private proof.

## Medal collection and interactive 3D viewer

`cabinet.css` uses the logo's cobalt blue and amethyst purple for the member/public profile, with a restrained burgundy collection tray and fitted vacant mounts for medals. The earlier glass and ornamental cabinet designs have been superseded.

`badge-cabinet.src.js` builds real Three.js meshes: beveled metal bodies, enamel inlays, raised symbols, edge studs, and a reverse face. Shelf portraits are cached renders of the same models. Tapping a task, association award, or rank lifts its model into an interactive viewer; pointer/touch dragging rotates it with inertia. Close or Escape returns it to its shelf. Arrow keys rotate, Home/reset restores the view, and focus returns to the originating badge. Reduced-motion preferences disable the transition and inertia. The details button retains the existing task/evidence workflow. If WebGL is unavailable, badges open the existing detail dialog directly.

The collection uses pre-rendered, lazy-loaded WebP portraits and PNG mount masks. The initial `badge-cabinet.js` loader is about 3 KB; `badge-viewer.js` loads only when an earned medal is opened. The viewer shares one WebGL context, renders only during interaction/animation, caps pixel ratio at 2, and disposes model resources on close. No CDN is needed.

Validation: `npm test` covers 30 API/security/workflow checks including the cached image routes and private source restrictions. `node tests/cabinet.browser.cjs` uses installed Microsoft Edge and isolated fixture data to verify rendering, mouse and emulated-touch rotation, keyboard/focus, closing, evidence submission, 320px/390px layouts, public profiles, reduced motion, and WebGL fallback. Screenshots are written to `artifacts/`. This does not modify a production database or deploy the website; physical-phone GPU performance still needs device testing.

### Ribbon-suspended medal redesign

The current models replace the hexagonal badge with three families: round laurel medals, oval banner decorations, and five-point enamel star orders with radiating metalwork. Visual references were close-up photographs of the [Order of the Badge of Honour](https://medalsmilitaria.com/products/soviet-order-of-the-badge-of-honour) and [Order of Friendship of Peoples](https://mondvor.com/OFriend.html). Reference photographs are not shipped as site assets; the club decorations are original procedural meshes.

`medal-model.js` builds cloth-textured pentagonal ribbons, metal suspension rings, beveled bodies, convex laurel leaves, enamel fields, inscriptions, and reverse pins/serials. Logo blue/purple remains in the ribbons and enamel, with warm metal and red accents. Each model is batched by material to reduce draw calls. The same model supplies the cabinet portrait and touch viewer; `medal-art.js` provides a matching SVG fallback and detail-dialog illustration. Use `npm run build:badges` after editing the viewer/loader. After changing model geometry, materials, pose, or lighting, run `npm run build:medal-assets` to regenerate portraits/masks and rebuild both bundles. The latter command uses installed Microsoft Edge for reproducible local rendering.

The browser check also captures round, oval, star, and reverse views in `artifacts/`. Its touch input is browser emulation, not a physical phone test.

The surrounding profile retains the club's blue-purple palette. Collection styling lives in `cabinet.css`; `growth-ui.js` shares the collection behavior between member and public profiles.

### Current collection: fitted vacant mounts

The ornate cabinet above has been replaced with a restrained burgundy collection tray. Glass reflections, shelves, gold framing, and corner/crest decorations are removed. Unacquired tasks, association awards, and ranks display empty recesses instead of dimmed medals. The recess mask comes from the same rendered model as the earned medal, giving each ribbon and medal family a matching mount; SVG silhouettes provide the fallback without WebGL.

Collection positions remain stable across approvals (association awards followed by the growth catalog). Pending/rejected submissions remain empty; approval fills the original mount. Selecting an empty mount opens its requirements directly. Selecting an earned medal opens the rotating 3D viewer and exposes its empty recess until the medal returns. Member and public profiles share this behavior. Browser verification covers vacant/pending/approved states, stable positions, taking out/returning a medal, and the existing mouse/touch, accessibility, responsive, and submission checks. `artifacts/cabinet-desktop.png` and `artifacts/cabinet-earned.png` show the fixture before and after approval.

### Performance and return animation

Saved-login and expanding the collection previously built 3D models and encoded images synchronously, including hidden/offscreen medals. The collection now displays prepared assets without creating any WebGL context. Portraits are shared by symbol/rank, image decoding is asynchronous, and content-hashed image URLs support immutable caching. Authentication still validates saved sessions with the server.

Deploy `badge-cabinet.js`, `badge-viewer.js`, the files referenced by `medal-assets/manifest.json`, `cabinet.css`, `growth-ui.js`, and the updated server routes together. The manifest and source modules are build inputs, not public endpoints. `npm run build:medal-assets` renders 12 symbol portraits and four ranks; `npm run build:badges` rebuilds JavaScript without rerendering images.

The inspector now has a viewport-sized modal layer and a separate panel, allowing the medal to fly outside the panel without clipping. Return animation uses the current slot position, preserves the portrait's aspect ratio, and settles the model back into its resting rotation. Entry/exit cancellation, resize, missing/offscreen origins, reduced motion, and focus restoration are handled. Escape also cancels a pending first-time viewer download. MIEE's right offset is now 14px (previously -7px).

`node tests/cabinet.performance.cjs after` restores a saved login and expands 55 fixture medals. It asserts that neither action loads the 3D viewer or creates a GPU context. In the local Edge fixture, the original run measured 1,068 ms to restored-page readiness and 3,629 ms to expansion readiness; the optimized run measured about 80 ms and 20 ms. These are local responsiveness measurements, not production-network or physical-phone guarantees. Results are saved in `artifacts/performance-before.json` and `artifacts/performance-after.json`. The browser workflow checks also cover closing during entry, returning after viewport/scroll changes, resizing during exit, and cancelling a delayed viewer download.
