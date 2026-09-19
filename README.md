# Surface Client

A Minecraft launcher for the desktop, built on Tauri 2 and React over a native Rust core.

Nothing in the interface is invented. The version list comes from Mojang, mods and their
dependencies from Modrinth. Downloads are checked against their published SHA-1, the
classpath and the argument list are assembled from the version metadata, and the game runs
as a real child process whose output is piped into the console view.

## What it does

- Installs any Minecraft version from Mojang's manifest: client jar, libraries, natives and
  assets, each checked against its SHA-1 before use.
- Builds Fabric and Quilt instances by merging the loader profile with the vanilla version,
  and Forge instances by running its official installer in an isolated workspace, so your
  own `.minecraft` is never touched. Forge is unstable; see below.
- Starts the game as a real child process and streams its log output into the console view.
- Signs in to Microsoft accounts with the OAuth device code flow, or creates offline accounts
  with the same UUID scheme vanilla servers use.
- Browses Modrinth, downloads mod jars into the instance folder and resolves their required
  dependencies from Modrinth's own metadata. Disabling a mod renames its jar rather than
  deleting it, so toggling one never costs a download.
- Downloads a matching Eclipse Temurin JDK when the version an instance needs is missing,
  on Windows, macOS and Linux, x64 and ARM alike.

Forge support is still unstable. The launcher drives Forge's official installer, which is
slow, needs a working Java runtime of its own and fails on some version combinations; when
it does, the error it printed is reported as-is. Treat a Forge instance as something to
verify rather than something that will just work.

NeoForge instances still need their official installer run by hand; point the instance at the
version it produces.

## Requirements

- Rust 1.77+ and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.
  On Fedora: `sudo dnf install webkit2gtk4.1-devel libsoup3-devel openssl-devel gtk3-devel
  librsvg2-devel patchelf`.
- Node.js 20+.
- A Java runtime for the versions you want to play. The launcher searches the usual locations
  for each platform and picks the one a version requires; if it is missing, it can download
  one from Adoptium instead.

## Running it

```bash
npm install
npm run tauri:dev     # desktop app with the native core
npm run dev           # UI only, in a browser; launching is unavailable
npm run tauri:build   # production bundle
```

## Linux notes

The app disables WebKitGTK's DMA-BUF renderer on Linux at startup. Without that,
the web process fails to allocate its buffers on several Mesa and NVIDIA setups
and the window stays blank or grey. Running through XWayland does not avoid it.
Set `WEBKIT_DISABLE_DMABUF_RENDERER` yourself to override.

## Microsoft sign-in

Microsoft requires every launcher to register its own Azure application, so no client id ships
with this repository. Register one with the `XboxLive.signin` scope and device code flow enabled,
then set it before building:

```bash
export SURFACE_MS_CLIENT_ID=<your-azure-application-id>
```

Without it, offline accounts still work and the sign-in button reports that it is not configured.

## Where files live

Everything is stored under the OS data directory in `SurfaceClient/`:

```
versions/     version metadata and client jars
libraries/    shared maven library cache
assets/       shared asset objects and indexes
natives/      unpacked native binaries, per version
instances/    one .minecraft game directory per instance
jvm/          Java runtimes the launcher downloaded itself
forge/        isolated workspaces for the Forge installer
exports/      modpacks and launch scripts written out of the app
logs/         launcher and mod logs
```

## Layout

```
src/            React UI
src/services/   API clients and the bridge to the native core
src-tauri/src/  the launcher core: meta, install, launch, auth, java
```
