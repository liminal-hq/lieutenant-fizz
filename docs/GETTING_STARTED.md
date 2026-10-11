# Getting the game going

Lieutenant Fizz runs in a browser, as a desktop app on Linux, macOS and Windows, and as an Android app. This page covers each, how to check a download, and the controls on each. To build it yourself, see "Getting started" in the [README](../README.md).

## In a browser

Open [liminalhq.ca/lieutenant-fizz](https://liminalhq.ca/lieutenant-fizz/) in a recent Chrome, Firefox, Edge or Safari with WebGL2. Nothing to install. It works with a keyboard, a gamepad or touch, and a phone browser can add it to the Home screen as a fullscreen landscape app.

## Downloads

Every tagged version has a release on the [Releases page](https://github.com/liminal-hq/lieutenant-fizz/releases) with these files. Take the ones for your system; the version number is in the name.

| System | File |
|---|---|
| Debian, Ubuntu and relatives | `Lieutenant-Fizz_<version>_amd64.deb` or `_arm64.deb` |
| Fedora, openSUSE and relatives | `Lieutenant-Fizz-<version>-1.x86_64.rpm` or `.aarch64.rpm` |
| Any Linux | `Lieutenant_Fizz-<version>-anylinux-x86_64.AppImage` or `-aarch64.AppImage` |
| macOS (Apple silicon and Intel) | `Lieutenant-Fizz_<version>_universal.dmg` |
| Android | `lieutenant-fizz-v<version>-<code>.apk` |
| Windows | `Lieutenant-Fizz_<version>_x64_en-US.msi` or `Lieutenant-Fizz_<version>_x64-setup.exe` (use `arm64` on an ARM PC) |

The other files on a release are for people who work on the game: the `.aab` is the bundle for Google Play (it cannot be installed directly), and the mapping and native debug symbols read crash reports. The Linux, macOS and Windows builds are not signed by a publisher, so check them as below. macOS and Windows builds start with the first release after 0.1.0.

### Check a download

`SHA256SUMS` on the release lists a checksum for every file. On Linux, from the folder holding the download and the checksums:

```sh
sha256sum -c --ignore-missing SHA256SUMS
```

On macOS, print the file's checksum and compare it with the line in `SHA256SUMS`:

```sh
shasum -a 256 Lieutenant-Fizz_<version>_universal.dmg
```

## Linux

Pick one.

- **Debian or Ubuntu:** `sudo apt install ./Lieutenant-Fizz_<version>_amd64.deb` (use `_arm64.deb` on an ARM machine). It pulls in the WebKitGTK and GTK libraries the app needs.
- **Fedora or openSUSE:** `sudo dnf install ./Lieutenant-Fizz-<version>-1.x86_64.rpm` (or `zypper install` on openSUSE).
- **Anything else:** make the AppImage runnable and start it:

  ```sh
  chmod +x Lieutenant_Fizz-<version>-anylinux-x86_64.AppImage
  ./Lieutenant_Fizz-<version>-anylinux-x86_64.AppImage
  ```

The `.deb` and `.rpm` add it to your applications menu, under Games. F or F11 goes fullscreen.

**Controller rumble.** The app rumbles PlayStation controllers (DualShock 3 and 4) by writing to the controller's device file under `/dev/input`. A normal desktop session lets the person at the console do that. A minimal install or a remote session may not, and then there is no rumble until you can write to that device. The game still plays.

## macOS

1. Open the `.dmg` and drag Lieutenant Fizz into Applications.
2. The first time, macOS blocks it, because the app is not notarised by Apple. Do one of these:
   - Open the app once, dismiss the warning, then go to **System Settings > Privacy & Security**, scroll to the message about Lieutenant Fizz and choose **Open Anyway**.
   - Or run this once in Terminal, then open the app as usual:

     ```sh
     xattr -dr com.apple.quarantine "/Applications/Lieutenant Fizz.app"
     ```

After that it opens like any other app. It runs natively on both Apple silicon and Intel.

## Windows

1. Run the setup `.exe` (or the `.msi`). Either installs the app and a Start menu entry.
2. The first time, Windows SmartScreen may say it protected your PC, because the installer has no publisher signature. Choose **More info**, then **Run anyway**.
3. The app uses Microsoft's WebView2, which comes with Windows 10 and 11. The installer fetches it if it is missing.

Start it from the Start menu. F or F11 goes fullscreen. Rumble on a controller goes through the WebView's own gamepad support and has not been tried on Windows.

## Android

1. On the phone, download the `.apk` from the release.
2. Open it. Android asks to let your browser or file manager install apps: allow that for this one install in **Settings**, then go back and install.
3. Play Protect may warn about an app it has not seen before. Choose **Install anyway**.
4. Open Lieutenant Fizz. It runs in landscape.

With a computer instead, enable USB or wireless debugging and run `adb install lieutenant-fizz-v<version>-<code>.apk`.

A newer APK installs over an older one from the same release line. Once the game is on Google Play, a copy from Play and a copy installed from an APK are signed with different keys, so Android will not update one over the other: uninstall one before installing the other.

## Controls

- **Keyboard:** Keen-style (Ctrl jump, Alt pogo, Space fire) or modern (Z, X, C), with the arrow keys or WASD to move. Choose the layout under **Options**. Esc or P pauses.
- **Gamepad:** plug in or pair a controller and press a button. Remap any button under **Options > Controller**; several buttons can share one action.
- **Touch:** on a phone or tablet the on-screen D-pad, Jump, Pogo and Fizz buttons appear. Resize and move them under **Options > Touch controls**. On Android the system Back gesture goes back a screen or opens the pause menu.
- **Haptics:** on Android, vibration strength is under **Options > Haptics**; with a PlayStation controller on Linux, the same screen sets the controller's Rumble strength.

## Saves and settings

Progress autosaves on every overworld visit, and the pause menu has four save slots (F5 quick-saves, F9 loads). Saves and settings stay on the device: the browser keeps them in its own storage and the apps in their own data file. The browser and the apps do not share them, and there is no cloud sync.

## If it will not start

- **A black or blank screen in a browser:** the browser has no WebGL2, or hardware acceleration is off. Try another browser, or turn hardware acceleration on.
- **The Linux app will not launch:** run it from a terminal to see why. A missing library message means the WebKitGTK 4.1 and GTK 3 packages are not installed; the `.deb` and `.rpm` install them for you.
- **macOS says the app is damaged:** that is the quarantine flag on an app that is not notarised. Run the `xattr` command above.
- **Anything else:** open an issue on the [repository](https://github.com/liminal-hq/lieutenant-fizz/issues) with your system, the file you installed and what you saw.
