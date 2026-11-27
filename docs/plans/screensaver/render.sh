#!/usr/bin/env bash
# Renders the screensaver plan's concept art from its SVG masters into PNGs beside them.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# Usage: render.sh [--check]
#   --check  fail if a committed PNG differs from what this would write
# Needs `rsvg-convert` (librsvg). The scene is drawn at 4x its 320 x 200 logical size, the settings screen at 2x its
# 720 x 480 layout, each from the master's own width and height.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
check=0
[ "${1:-}" = "--check" ] && check=1

status=0
for name in scene-concept settings-concept; do
	out="$here/$name.png"
	if [ "$check" -eq 1 ]; then
		tmp="$(mktemp)"
		rsvg-convert --format=png "$here/$name.svg" >"$tmp"
		if ! cmp -s "$tmp" "$out"; then
			echo "render: $name.png is out of date" >&2
			status=1
		fi
		rm -f "$tmp"
	else
		rsvg-convert --format=png "$here/$name.svg" >"$out"
		echo "render: $out ($(stat -c %s "$out") bytes, sha256 $(sha256sum "$out" | cut -c1-16))"
	fi
done
exit "$status"
