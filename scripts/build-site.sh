#!/usr/bin/env bash
# Assembles the GitHub Pages site into dist-site/.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# A landing page sits at the root and each episode under its own subpath
# (https://liminalhq.ca/lieutenant-fizz/<episode>/).
set -euo pipefail
cd "$(dirname "$0")/.."

bun run build
rm -rf dist-site
mkdir -p dist-site
# -L copies the Fizz font files that site/assets/fonts links to, rather than the link itself.
cp -rL site/. dist-site/
# The page loads the WOFF2 files only; the OTF files are for editors.
rm -f dist-site/assets/fonts/*.otf
cp -r episodes/episode-1/dist dist-site/episode-1
touch dist-site/.nojekyll
echo "site assembled in dist-site/"
