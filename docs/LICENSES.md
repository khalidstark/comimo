# Third-party licences

Packages added for accounts, cloud storage and photo albums (Phase 3.2), pinned to exact versions.

| Package | Version | Licence | Used for |
|---|---|---|---|
| [qrcode](https://github.com/soldair/node-qrcode) | 1.5.4 (published 2024-08-05) | MIT, Copyright (c) 2012 Ryan Day | The printed QR code on a comic's last page and in the magazine. Only `create()` is used in the browser; the code is drawn as SVG by Comimo. |
| [@types/qrcode](https://github.com/DefinitelyTyped/DefinitelyTyped) | 1.5.6 (dev) | MIT | Types for qrcode. |
| [@vercel/blob](https://github.com/vercel/storage) | 2.8.2 | Apache-2.0 | Private image storage in production (comic images and album photos). |
| [@upstash/redis](https://github.com/upstash/redis-js) | 1.39.0 | MIT | Accounts, sessions, limits and each account's comic book index in production (03.2-01). |

qrcode brings dijkstrajs 1.0.3 (MIT), pngjs 5.0.0 (MIT) and yargs 15.4.1 (MIT); only its browser build is bundled.

The full licence texts ship inside each package in `node_modules/<package>/` (`license` or `LICENSE`).
