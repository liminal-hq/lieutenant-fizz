# CD-ROM image

**Status: preliminary.** `scripts/build-cdrom-preview.sh` builds a test image from released files and checks it. The release workflow does not build or attach a CD-ROM image yet; that is the `cdrom` job of issue #271. This page records the plan, what the tooling does and what a first build showed.

## What the disc is

A burnable, offline disc that holds the whole series (the DOS game and the desktop players for every episode as they ship), so its name and layout say Lieutenant Fizz and not Episode 1. One image carries three directory views of the same files: ISO 9660 Level 1 (8.3 names, which DOS reads), Joliet (long names for Windows) and Rock Ridge (long names and the executable bit for Linux). There is no HFS hybrid: macOS gets a DMG stored on the disc.

```text
disc-root/
├── Readme.txt
├── DOS/            the DOS release's disk files and INSTALL.BAT
├── Windows/        x64 and arm64 installers (.exe, .msi), and WebView2/ with the offline runtime
├── Linux/          x86_64 and aarch64 AppImages, deb and rpm
├── macOS/          the universal .dmg
└── Licences/       this repository's licences and the third-party notices
```

Left off the disc: the Android APK and AAB (they stay in the digital release), the native debug symbols and the R8 mapping file.

## Labels

| Where | Label | Why |
|---|---|---|
| ISO 9660 (DOS, and the label Rock Ridge shares) | `LT_FIZZ` | Uppercase letters, digits and underscores only, 32 characters at most. |
| Joliet | `Lieutenant Fizz` | Unicode, 16 characters at most (`-volid_for joliet`). `blkid` reads this one, so Linux file managers show it. |
| Volume set | `FE-<web release tag>` | Free text, 128 characters, naming the series and the files the disc was built from. |

A disc has no volume serial number the way the DOS floppy does (`FE01` plus the version); the volume set carries that information instead. DOSBox drops the underscore from the plain label (`LTFIZZ`); whether a real DOS CD driver does is unchecked.

## Building a preview

```bash
scripts/build-cdrom-preview.sh v0.4.0 v0.3.1 dist/cdrom
```

The arguments are the tag of this repository's release (the desktop files) and the tag of a `ScottMorris/lieutenant-fizz-dos` release (the DOS disk). It needs `gh`, `xorriso`, `isoinfo`, `bsdtar`, `sha256sum` and `python3`. The script:

1. downloads the two releases' files and checks each against its `SHA256SUMS`;
2. stages the disc tree, with the AppImages executable and everything else not, and writes `DOS/INSTALL.BAT`;
3. fails if a required file is missing or any file is empty;
4. masters the image with `xorriso -as mkisofs -iso-level 1 -R -J -joliet-long`;
5. lists the three views (`view-iso9660.txt`, `view-joliet.txt`, `view-rockridge.txt`), fails on a plain-name collision, on views that list different numbers of files and on an AppImage that lost its executable bit;
6. fails if the image is over the disc's capacity (700 MiB, `MEDIA_BYTES`) and writes `Lieutenant-Fizz-preview.iso.sha256`.

Every time in the image is `SOURCE_DATE_EPOCH`, so the same inputs give the same image: two runs with v0.4.0 and v0.3.1 gave the same SHA-256.

## What a first build showed

Built from the web v0.4.0 desktop files and the DOS v0.3.1 disk:

- **Size:** 272,977,920 bytes (260.3 MiB), 37.2% of 700 MiB. The two AppImages (about 106 MiB each) are most of it.
- **DOSBox:** the image mounts as a read-only CD (`imgmount d <image> -t iso`), and `INSTALL.BAT` copies the DOS files to `C:\FIZZ`. The installed game was not launched.
- **Not tried:** a Linux mount, and the installers on real Windows, Linux or macOS.

Findings that shape the real disc:

- **The game cannot run from the disc.** The DOS port writes `FIZZ.CFG`, `.SAV` files and `FIZZ.TMP` beside the executable, so the disc copies the game to the hard drive first (`INSTALL.BAT`). Changing where the DOS port saves would be a game change, tracked separately.
- **ISO 9660 Level 1 mangles long names.** The installers become `LIEUTEN0.EXE` and `LIEUTEN1.EXE`, so DOS and the plain view cannot tell x64 from arm64, and the licence files lose their extensions (`LICENSE0.`). Joliet and Rock Ridge show the real names. If the plain view should be usable, the staging step needs short aliases or one directory per architecture.
- **Rock Ridge is kept for the executable bit.** Joliet has no permissions; without Rock Ridge every file would look executable.
- **The DOS payload must be a fresh release.** The newest DOS release predates this repository's current DOS work, so a real disc pins a new one, by tag and checksum, and fails if it is missing. The CI job will do the same.

## The WebView2 runtime

The Windows player is a Tauri app and needs the Microsoft Edge WebView2 runtime. For a disc that sets up without a network, `Windows/WebView2/` holds Microsoft's standalone (offline) runtime installers, one per architecture. `WEBVIEW2_DIR=<folder of installers>` copies them in; the script downloads nothing for it, so the installers' source, version and checksum are pinned where they are fetched. The standalone installers are large (on the order of 150 MB each for x64 and arm64, to be confirmed), which would take the disc from about 260 MiB to roughly 560 MiB, so the capacity check matters once they are in. Their redistribution terms and a notice for `Licences/` are to be checked before a release.

## Still to do

- Apply the decisions above in the `cdrom` job of `release.yml`: consume the `fizz-player-release` artefact, a pinned DOS release, the WebView2 installers, then attach the image and its checksum to the draft release.
- A DOSBox smoke test in CI: mount the image read-only, run `INSTALL.BAT` and start the game from the copy.
- Short aliases for the plain view, if it should be usable.
- Test the Windows and Linux views and the offline setup on real systems, and the DMG on a modern Mac.
