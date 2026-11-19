# Website photography

Project and note imagery comes from Unsplash. The 14 downloaded source photos,
photographer links, photo URLs and license records are in
[`unsplash/credits.json`](unsplash/credits.json). These are illustrative business
scenes, not screenshots or photographs of the actual projects/customers.
ThisisEngineering photography is credited as **© This is Engineering**.

The native HTML keeps the existing layout and image frames. `npm run images`
(Python 3 with Pillow) creates local WebP variants at real pixel widths, updates
responsive `srcset`, gallery data, bilingual alt text and matching route covers.
Original images are retained for rebuilds. SVG logos remain lossless and the
small PNG favicon remains compatible with browsers. Animated input images retain
their frames. `image-manifest.json` records source and output dimensions/bytes.

`npm run build` only includes referenced images and gallery candidates; unused
source photos and archived template files do not ship. There are no runtime
requests to Unsplash. Image frames reserve their existing dimensions and use a
theme-aware shimmer until decode completes; failures offer a local retry.
Content placeholders disappear once the document/localized copy is ready,
independently of below-fold lazy images. Reduced-motion and no-JavaScript
preferences retain usable content.
