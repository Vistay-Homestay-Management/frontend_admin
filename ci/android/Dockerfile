FROM eclipse-temurin:21-jdk-jammy AS java
FROM node:24-bookworm

COPY --from=java /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH="${JAVA_HOME}/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"

ARG ANDROID_COMMANDLINE_TOOLS=15859902
ARG ANDROID_COMMANDLINE_SHA256=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583
# Google publishes API 37 under the SDK package ID android-37.0.
ARG ANDROID_API=37.0
ARG ANDROID_BUILD_TOOLS=37.0.0
ARG ANDROID_NDK=27.1.12297006

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip git python3 build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN curl --fail --location --retry 3 \
        "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_COMMANDLINE_TOOLS}_latest.zip" \
        --output /tmp/android-tools.zip \
    && echo "${ANDROID_COMMANDLINE_SHA256}  /tmp/android-tools.zip" | sha256sum --check - \
    && mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && unzip -q /tmp/android-tools.zip -d "${ANDROID_HOME}/cmdline-tools" \
    && mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm /tmp/android-tools.zip \
    && (yes | sdkmanager --licenses > /dev/null) \
    && sdkmanager "platform-tools" "platforms;android-${ANDROID_API}" \
        "build-tools;${ANDROID_BUILD_TOOLS}" "ndk;${ANDROID_NDK}" "cmake;3.22.1"

WORKDIR /workspace
