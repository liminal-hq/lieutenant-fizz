#!/usr/bin/env bash
# Stages a preliminary Lieutenant Fizz CD-ROM image from released files and checks it.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# Downloads the desktop files of one release of this repository and the DOS files of one release of
# ScottMorris/lieutenant-fizz-dos, checks them against their SHA256SUMS, stages the disc tree, masters an
# ISO 9660 Level 1 + Joliet + Rock Ridge image with xorriso and inspects it. The release workflow does not
# call this yet: it is the manual form of the `cdrom` job in issue #271, for finding out how the tooling
# behaves. See docs/CDROM.md.
#
# usage: scripts/build-cdrom-preview.sh <web release tag, such as v0.4.0> <DOS release tag, such as v0.3.1> [output directory]
#
# Needs gh (signed in), xorriso, isoinfo (cdrtools or genisoimage), bsdtar, sha256sum and python3. The same inputs
# give the same ISO: every time in the image is SOURCE_DATE_EPOCH (default: the first of January 2026, UTC), so
# the image does not change from one build to the next.
#
# Environment:
#   SOURCE_DATE_EPOCH  Seconds since the epoch stamped on the image and its files.
#   WEBVIEW2_DIR       A folder of WebView2 runtime installers to copy to Windows/WebView2/ (for a setup that works
#                      offline). Nothing is downloaded for it: it is left out unless this is set.
#   MEDIA_BYTES        The disc's capacity; the build fails if the image is larger (default 734003200, 700 MiB).

set -euo pipefail
cd "$(dirname "$0")/.."

WEB_TAG="${1:?usage: scripts/build-cdrom-preview.sh <web release tag> <DOS release tag> [output directory]}"
DOS_TAG="${2:?usage: scripts/build-cdrom-preview.sh <web release tag> <DOS release tag> [output directory]}"
OUT="${3:-dist/cdrom}"
EPOCH="${SOURCE_DATE_EPOCH:-1767225600}"
MEDIA_BYTES="${MEDIA_BYTES:-734003200}"
DOS_REPO="ScottMorris/lieutenant-fizz-dos"
# The plain ISO 9660 label is limited to uppercase letters, digits and underscores; Joliet's can be 16 mixed-case
# characters. The volume set names the disc's series and the files it was built from.
LABEL="LT_FIZZ"
JOLIET_LABEL="Lieutenant Fizz"

for tool in gh xorriso isoinfo bsdtar sha256sum python3; do
  command -v "$tool" > /dev/null || { echo "build-cdrom-preview.sh: $tool is needed" >&2; exit 1; }
done

# Everything is made in empty directories of its own, so a stale file from an earlier run cannot end up on the disc.
rm -rf "$OUT"
DL_WEB="$OUT/download/web"
DL_DOS="$OUT/download/dos"
DISC="$OUT/disc-root"
mkdir -p "$DL_WEB" "$DL_DOS" "$DISC"/{DOS,Windows,Linux,macOS,Licences}

echo "== Downloading the desktop files of $WEB_TAG"
gh release download "$WEB_TAG" --dir "$DL_WEB" \
  --pattern '*.exe' --pattern '*.msi' --pattern '*.dmg' --pattern '*.AppImage' --pattern '*.deb' --pattern '*.rpm' \
  --pattern 'SHA256SUMS'
echo "== Downloading the DOS disk of $DOS_TAG"
gh release download "$DOS_TAG" -R "$DOS_REPO" --dir "$DL_DOS" --pattern '*-disk.zip' --pattern 'SHA256SUMS'

# A release's SHA256SUMS also lists files this disc leaves out (the Android files and the debug symbols), so only the
# downloaded ones are checked, and every downloaded file must be listed.
verify() {
  local dir="$1" file
  (
    cd "$dir"
    for file in *; do
      [ "$file" = SHA256SUMS ] && continue
      grep -F " $file" SHA256SUMS | sha256sum -c - > /dev/null \
        || { echo "build-cdrom-preview.sh: $file does not match $dir/SHA256SUMS" >&2; exit 1; }
    done
  )
}
verify "$DL_WEB"
verify "$DL_DOS"
echo "Checksums match."

echo "== Staging the disc"
bsdtar -xf "$DL_DOS"/*-disk.zip -C "$DISC/DOS"
cp "$DL_WEB"/*.exe "$DL_WEB"/*.msi "$DISC/Windows/"
cp "$DL_WEB"/*.AppImage "$DL_WEB"/*.deb "$DL_WEB"/*.rpm "$DISC/Linux/"
cp "$DL_WEB"/*.dmg "$DISC/macOS/"
cp LICENSE-APACHE LICENSE-MIT "$DISC/Licences/"
[ -f NOTICE ] && cp NOTICE "$DISC/Licences/NOTICE.TXT"
[ -f "$DISC/DOS/CWSDPMI.DOC" ] && cp "$DISC/DOS/CWSDPMI.DOC" "$DISC/Licences/CWSDPMI.TXT"
if [ -n "${WEBVIEW2_DIR:-}" ]; then
  mkdir -p "$DISC/Windows/WebView2"
  cp "$WEBVIEW2_DIR"/* "$DISC/Windows/WebView2/"
fi

# The game saves beside itself and a CD cannot be written to, so the DOS files are copied to the hard drive first.
printf '%s\r\n' \
  '@ECHO OFF' \
  'REM Copies Lieutenant Fizz to C:\FIZZ, because the game saves beside itself and a CD cannot be written to.' \
  'IF NOT EXIST C:\FIZZ\NUL MD C:\FIZZ' \
  'COPY *.EXE C:\FIZZ > NUL' \
  'COPY *.TXT C:\FIZZ > NUL' \
  'ECHO Copied to C:\FIZZ. Type C: then CD \FIZZ then FIZZ to play.' > "$DISC/DOS/INSTALL.BAT"

cat > "$DISC/Readme.txt" << EOF
Lieutenant Fizz
PRELIMINARY TEST DISC (built from released files; not a release)

DOS/      MS-DOS version ($DOS_TAG). Run INSTALL.BAT to copy it to C:\\FIZZ, since it saves beside itself.
Windows/  Installers (x64 and arm64) for the desktop player ($WEB_TAG). The player needs the WebView2 runtime; see Windows/WebView2/ where it is included.
Linux/    AppImages (x86_64, aarch64), deb and rpm ($WEB_TAG).
macOS/    Universal DMG ($WEB_TAG).
Licences/ Licences and notices.
EOF

# Rock Ridge keeps the mode, so the AppImages stay executable and everything else does not.
find "$DISC" -type f -exec chmod 644 {} +
find "$DISC" -type f -name '*.AppImage' -exec chmod 755 {} +
find "$DISC" -exec touch -d "@$EPOCH" {} +

echo "== Checking the staged files"
required=(DOS/FIZZ.EXE DOS/CWSDPMI.EXE DOS/INSTALL.BAT Readme.txt Licences/LICENSE-APACHE Licences/LICENSE-MIT)
for file in "${required[@]}"; do
  [ -s "$DISC/$file" ] || { echo "build-cdrom-preview.sh: $file is missing or empty" >&2; exit 1; }
done
for kind in "Windows/*.exe" "Windows/*.msi" "Linux/*.AppImage" "Linux/*.deb" "Linux/*.rpm" "macOS/*.dmg"; do
  compgen -G "$DISC/$kind" > /dev/null || { echo "build-cdrom-preview.sh: no $kind on the disc" >&2; exit 1; }
done
if [ -n "$(find "$DISC" -type f -empty -print -quit)" ]; then
  echo "build-cdrom-preview.sh: the disc has an empty file" >&2
  exit 1
fi

echo "== Mastering the image"
ISO="$OUT/Lieutenant-Fizz-preview.iso"
SOURCE_DATE_EPOCH="$EPOCH" xorriso -as mkisofs -iso-level 1 -R -J -joliet-long \
  -V "$LABEL" -volid_for joliet "$JOLIET_LABEL" -volset "FE-$WEB_TAG" \
  -o "$ISO" "$DISC" 2> "$OUT/xorriso.log" || { cat "$OUT/xorriso.log" >&2; exit 1; }

echo "== Inspecting the image"
isoinfo -i "$ISO" -f | sort > "$OUT/view-iso9660.txt"
isoinfo -i "$ISO" -J -f | sort > "$OUT/view-joliet.txt"
isoinfo -i "$ISO" -R -f | sort > "$OUT/view-rockridge.txt"
# An ISO 9660 name must be unique in its directory; a collision would hide a file in the plain view.
if [ -n "$(sed 's/;1$//' "$OUT/view-iso9660.txt" | sort | uniq -d)" ]; then
  echo "build-cdrom-preview.sh: two files share a plain ISO 9660 name" >&2
  exit 1
fi
# The three views must list the same number of files.
counts="$(wc -l < "$OUT/view-iso9660.txt") $(wc -l < "$OUT/view-joliet.txt") $(wc -l < "$OUT/view-rockridge.txt")"
[ "$(tr ' ' '\n' <<< "$counts" | sort -u | wc -l)" -eq 1 ] \
  || { echo "build-cdrom-preview.sh: the views list different numbers of files ($counts)" >&2; exit 1; }
# The AppImages must still be executable through Rock Ridge.
if isoinfo -i "$ISO" -R -l | grep 'AppImage' | grep -qv '^-rwx'; then
  echo "build-cdrom-preview.sh: an AppImage lost its executable bit" >&2
  exit 1
fi

size="$(stat -c %s "$ISO")"
[ "$size" -le "$MEDIA_BYTES" ] || { echo "build-cdrom-preview.sh: the image is $size bytes, over the $MEDIA_BYTES the disc holds" >&2; exit 1; }
sum="$(sha256sum "$ISO" | cut -d' ' -f1)"
echo "$sum  $(basename "$ISO")" > "$ISO.sha256"

python3 -I - "$size" "$MEDIA_BYTES" << 'PY'
import sys
size, cap = int(sys.argv[1]), int(sys.argv[2])
print(f"Image: {size:,} bytes, {size / 1048576:.1f} MiB, {size / cap * 100:.1f}% of the disc, {(cap - size) / 1048576:.0f} MiB free")
PY
echo "Files: $(wc -l < "$OUT/view-joliet.txt") entries in the Joliet view"
echo "Labels: plain $LABEL, Joliet $JOLIET_LABEL, volume set FE-$WEB_TAG"
echo "SHA-256: $sum"
echo "Wrote $ISO"
