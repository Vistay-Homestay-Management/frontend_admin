# Admin Android artifacts on Jenkins

The root Jenkinsfile analyzes code with SonarQube and waits for the Quality Gate,
then builds the web Docker image and an internal Android APK. Both outputs are
enabled by default. Use **Build with Parameters** to disable either output.

## Requirements

- Linux amd64 Docker host with internet access and sufficient disk space for the
  Android SDK, NDK, npm dependencies, and native builds.
- Jenkins container named `cmc-jenkins`, with Docker CLI/Buildx and access to the
  host Docker socket, as in the current deployment.
- Jenkins workspaces under `/var/jenkins_home`, shared through `--volumes-from`.
- Existing Jenkins SonarQube configuration named `SonarQube` and its webhook.

No Android Studio, Expo cloud account, or Android SDK installation on the host is
needed. `ci/android/Dockerfile` builds a local tool image with Node 24, Java 21,
Android SDK 37, build tools 37.0.0, and NDK 27.1.12297006. Match these versions to
the app's React Native/Expo requirements when upgrading dependencies. The first
build downloads several large toolchains; later builds reuse Docker layers and
the dedicated npm/Gradle cache volumes.

## App configuration

`ci/android/mobile.env` contains the public deployment URLs copied from the local
mobile configuration. Jenkins passes these values when generating and bundling
the Android app. Changing an endpoint requires building and installing a new APK.
No local `.env.local` file is needed on Jenkins, and dotenv loading is disabled to
avoid stale workspace configuration. Never put secrets in `EXPO_PUBLIC_*` values.

The authentication API URL intentionally matches the supplied local configuration:
`https://identity.fakebook.tech/api/v1/backoffice/accounts`. The public reverse proxy
must route that path to Authentication Service; the Keycloak issuer URL alone does
not provide this application API.

The Keycloak public client `vistay-backoffice-mobile` must allow the redirect URI
`vistay-admin://oauth/callback` in realm `vistay-backoffice`.

## Download

Open a successful Jenkins build and select **Artifacts**, then download:

`artifacts/android/<build-number>/vistay-admin-<build-number>-internal.apk`

The APK targets ARM64 Android devices and embeds its JavaScript bundle, so Metro
is not required. A SHA256SUMS file is also archived. Jenkins keeps 20 build records
and artifacts for the latest 10 builds.

## Signing

The generated Expo Android template signs the release variant with its debug
keystore. This APK is for demo/internal installation. It does not configure a
production signing identity or publish to Google Play/GitHub Releases. For a store
release, use a persistent private keystore in Jenkins Credentials, configure
release signing through an Expo config plugin, and build a signed AAB.

The ignored native `android/` directory is regenerated with Expo Prebuild for each
build. Do not maintain manual native edits there; put persistent changes in Expo
configuration or config plugins.
