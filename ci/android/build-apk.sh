#!/usr/bin/env bash
set -euo pipefail

: "${BUILD_NUMBER:?Jenkins BUILD_NUMBER is required}"
: "${EXPO_PUBLIC_GRAPHQL_URL:?GraphQL URL is required}"
: "${EXPO_PUBLIC_AUTH_API_URL:?Authentication API URL is required}"
: "${EXPO_PUBLIC_OIDC_ISSUER:?OIDC issuer is required}"
: "${EXPO_PUBLIC_OIDC_CLIENT_ID:?OIDC client ID is required}"
: "${EXPO_PUBLIC_OIDC_REDIRECT_URI:?OIDC redirect URI is required}"

repo_root="$(pwd)"
artifact_dir="${repo_root}/artifacts/android/${BUILD_NUMBER}"

npm ci
cd apps/mobile
# android/ is generated and ignored by Git; regenerate it from the Expo config.
npx --no-install expo prebuild --platform android --clean --no-install
cd android
# Release bundles JavaScript into the APK so it works without Metro.
# The generated Expo template uses its debug signing key: internal installs only.
bash ./gradlew :app:assembleRelease \
    -PreactNativeArchitectures=arm64-v8a \
    --no-daemon --max-workers=2 --console=plain --stacktrace

mkdir -p "${artifact_dir}"
cp app/build/outputs/apk/release/app-release.apk "${artifact_dir}/vistay-admin-${BUILD_NUMBER}-internal.apk"
cd "${artifact_dir}"
sha256sum ./*.apk > SHA256SUMS
printf 'Internal Android APK archived from build %s\n' "${BUILD_NUMBER}" > README.txt
printf 'ARM64 APK, release bundle with the generated template debug signing key.\n' >> README.txt
printf 'Install directly for internal use; this is not a Google Play release.\n' >> README.txt
