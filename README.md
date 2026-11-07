<img src=".github/assets/app-icon.png" width="100px" align="left" alt="Koi icon">

### Koi Browser

[![download](https://img.shields.io/github/v/release/Awhalen1999/koi?label=download&color=brightgreen)](https://github.com/Awhalen1999/koi/releases/latest)
[![downloads](https://img.shields.io/github/downloads/Awhalen1999/koi/total?color=brightgreen)](https://github.com/Awhalen1999/koi/releases)
[![website](https://img.shields.io/badge/website-koi.surf-4a90d9)](https://koi.surf)
![platform](https://img.shields.io/badge/platform-macOS-blue)
![requirements](https://img.shields.io/badge/requirements-Apple%20silicon-fa4e49)
[![license](https://img.shields.io/github/license/Awhalen1999/koi?color=orange)](LICENSE)

## Install

Download the latest release from [koi.surf](https://koi.surf) or [here](https://github.com/Awhalen1999/koi/releases/latest), open the DMG, and move Koi into your `Applications` folder. Koi updates itself.

<img src=".github/assets/screenshot.jpg" alt="Koi with a new tab open">

## Building

Requires Xcode command line tools, Node 26, Python 3, and GNU tar (`brew install gnu-tar`).

```sh
npm install
npm run download             # fetches Firefox into engine/
npx surfer set brand release # once per clone
npm run bootstrap            # Mozilla's build toolchain
npm run import               # applies patches and branding, generates prefs
npm run build
npm start
```

## License

Koi is available under the [Mozilla Public License 2.0](LICENSE). It's built on Firefox, Mozilla's work, with [surfer](https://github.com/zen-browser/surfer).
