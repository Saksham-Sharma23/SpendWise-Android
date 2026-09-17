# Run SpendWise on your phone (Metro + wireless debugging)

How to get the app running on a physical Android phone from a cold start, and what to do when it
doesn't connect. There is no emulator in this project: the phone is the test device.

---

## Before you start (one-time checks)

| Check                                | How                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Developer options enabled**        | Settings → About phone → tap **Build number** 7 times                                                                                                                   |
| **Phone and PC on the same network** | Same Wi-Fi/router. The phone's IP and the PC's IP should share the first three parts (e.g. `192.168.29.x`). PC: `ipconfig`. Phone: the Wireless debugging screen        |
| **`adb` available**                  | `adb version` prints a version. If not, install Android SDK Platform-Tools and add it to `PATH`                                                                         |
| **A development build is installed** | SpendWise is on the phone and opens to the Expo development launcher. If not, see [Install or rebuild the development build](#install-or-rebuild-the-development-build) |
| **Dependencies installed**           | `npm install` has been run in the project folder                                                                                                                        |

---

## Step 1: Open a terminal in the project

In VS Code press **Ctrl + `**, or open PowerShell and run:

```powershell
cd D:\Projects\SpendWise_Android
```

## Step 2: Turn on wireless debugging

On the phone: **Settings → Developer options → Wireless debugging → On**.
Accept the "Allow wireless debugging on this network?" prompt if it appears.

## Step 3: Connect the phone to adb

```powershell
adb devices
```

You want a line ending in `device`, for example:

```
List of devices attached
adb-10BE9F0PTA001BR-mNzDHI._adb-tls-connect._tcp    device
```

- **Empty list?** Wait about 5 seconds and run `adb devices` again. The first run only starts the adb
  daemon, and it takes a moment to discover the phone on the network.
- **Still empty?** Connect by address. On the Wireless debugging screen, read **IP address & Port**
  and run:

  ```powershell
  adb connect 192.168.29.205:41829     # use the IP:port your phone shows
  ```

  The port changes every time wireless debugging is turned off and on, or the phone reboots.

- **`failed to authenticate` / never paired on this PC?** Pair first (once per PC):
  1. On the phone, tap **Pair device with pairing code**. It shows a 6-digit code and a _pairing_
     IP:port.
  2. On the PC:
     ```powershell
     adb pair 192.168.29.205:37105        # the PAIRING port from the popup
     # enter the 6-digit code when asked
     ```
  3. Then connect using the **main** port from the Wireless debugging screen (not the pairing port):
     ```powershell
     adb connect 192.168.29.205:41829
     ```

**Optional check** that the phone responds and the app is installed:

```powershell
adb shell getprop ro.product.model
adb shell pm list packages | findstr spendwise     # expect: package:com.spendwise.android
```

## Step 4: Point the phone at Metro through adb

```powershell
adb reverse tcp:8081 tcp:8081
```

This makes `localhost:8081` **on the phone** point to Metro **on the PC**, over the adb connection.
The Windows firewall and Wi-Fi client isolation then can't block it.

> Run this again every time the phone reconnects to adb. The mapping does not survive a disconnect.

## Step 5: Start Metro

```powershell
npm start
```

This runs `expo start --dev-client`. Wait until the terminal shows a QR code and a
`Metro waiting on …` line.

- If Windows asks whether to allow **Node.js** through the firewall, allow it on **Private networks**.
- **Leave this terminal open.** Closing it stops Metro.

## Step 6: Open the app on the phone

Pick one:

- **A.** Click into the Metro terminal and press **`a`**. It launches SpendWise on the phone connected to adb.
- **B.** Open **SpendWise** on the phone. The development launcher lists the running server under
  _Development servers_; tap it.
- **C.** In the development launcher, tap **Enter URL manually** and type `http://localhost:8081`.

The **first load** bundles all the JavaScript and can take 30–60 seconds, with a progress bar in the
terminal. After that, saving a file updates the phone within a second or two (Fast Refresh).

---

## While Metro is running

| Action               | How                                                                              |
| -------------------- | -------------------------------------------------------------------------------- |
| Reload the app       | Press **`r`** in the Metro terminal                                              |
| Open the dev menu    | Press **`m`** in the terminal, shake the phone, or `adb shell input keyevent 82` |
| Open the dev harness | In the app: **More → Dev harness**                                               |
| Stop Metro           | **Ctrl + C** in the Metro terminal                                               |

## Daily quick start (once everything has worked before)

```powershell
cd D:\Projects\SpendWise_Android
adb devices                       # phone listed as "device"? if not: adb connect <ip>:<port>
adb reverse tcp:8081 tcp:8081
npm start                         # then press "a"
```

---

## Troubleshooting

| Symptom                                                                                | Fix                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adb devices` is empty                                                                 | Wireless debugging is off, the phone is asleep/locked, or the port changed. Repeat [Step 3](#step-3-connect-the-phone-to-adb)                               |
| Device shows as `offline` or `unauthorized`                                            | `adb disconnect`, then `adb connect <ip>:<port>` again. If it persists, toggle Wireless debugging off and on, or re-pair                                    |
| Red screen: _Unable to load script_ / _Could not connect to development server_        | Run `adb reverse tcp:8081 tcp:8081` again, then press `r`                                                                                                   |
| App shows old code or behaves oddly after pulling changes or installing a package      | Stop Metro, then `npm run start:clear` (clears Metro's cache)                                                                                               |
| _Port 8081 is being used by another process_                                           | An old Metro is still running. Close that terminal. If you accept another port Expo offers, reverse **that** port instead (`adb reverse tcp:8082 tcp:8082`) |
| The router blocks devices from seeing each other (hotel/office Wi-Fi)                  | `npm run start:tunnel` instead of `npm start`                                                                                                               |
| Error that a **native module** is missing or not found (`Cannot find native module …`) | The installed build is older than a native package added since. Rebuild it (below). Adding JS or changing the database schema does **not** need a rebuild   |

---

## Install or rebuild the development build

Only needed the first time, or after adding a package with native code or changing `app.config.ts`.

```powershell
# Stop Metro first. Gradle and Metro together run this machine out of memory.
npm run prebuild:dev              # regenerates android/ with INTERNET allowed (dev only)
npm run android:local             # arm64-only build, installs on the connected phone
```

Then continue from [Step 4](#step-4-point-the-phone-at-metro-through-adb).

Notes:

- **Use `npm run prebuild:dev`, not `npx expo prebuild`.** A plain prebuild is the release policy and
  strips the `INTERNET` permission, so the app could not reach Metro.
- **Don't start Metro until the build finishes.** On 8 GB of RAM the Kotlin daemon or clang gets
  killed mid-build, which surfaces as a vague "Compilation error".
- Alternatively, build in the cloud: `npx eas build --profile development --platform android` and
  install the APK from the link it prints.
