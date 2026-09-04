#!/usr/bin/env bash
#
# Builds, signs and verifies LeafForge Studio as an installable APK.
#
# This project intentionally avoids the Android SDK and Gradle: everything is
# done with the standalone tools in ~/.toolchain (aapt2, ecj, d8, apksigner),
# which is why it can run in a sandbox with no network access to Google.
#
# Usage:  npm run apk        (runs `npm run build:apk-assets` first if needed)
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="${TOOLCHAIN:-$HOME/.toolchain}"
JDK="$TOOLS/jdk17/jdk4py/java-runtime/bin"
BIN="$TOOLS/bin"
AJ="$BIN/android.jar"

SRC="$REPO/android/app/src/main"
BUILD="$REPO/android/build"
KEYSTORE="$REPO/android/leafforge.jks"

APP_NAME="LeafForge Studio"
PACKAGE="com.leafforge.studio"
VERSION_CODE=1
VERSION_NAME="1.0.0"
MIN_SDK=24
TARGET_SDK=33

export PATH="$JDK:$BIN:$PATH"
export JAVA_HOME="$TOOLS/jdk17/jdk4py/java-runtime"

echo "==> LeafForge Studio APK build"
echo "    repo:    $REPO"
echo "    tools:   $TOOLS"

for tool in aapt2 ecj.jar d8.jar apksigner.jar android.jar; do
  if [ ! -f "$BIN/$tool" ]; then
    echo "!! missing $BIN/$tool - set TOOLCHAIN=/path/to/toolchain" >&2
    exit 1
  fi
done

if [ ! -f "$SRC/assets/index.html" ]; then
  echo "==> web assets missing, building them now"
  (cd "$REPO" && npm run build:apk-assets)
fi

echo "==> cleaning"
rm -rf "$BUILD"
mkdir -p "$BUILD/dex" "$BUILD/classes" "$BUILD/gen"

echo "==> aapt2 compile (resources)"
aapt2 compile --dir "$SRC/res" -o "$BUILD/compiled.zip"

echo "==> aapt2 link (manifest + assets)"
aapt2 link \
  -o "$BUILD/res.apk" \
  -I "$AJ" \
  --manifest "$SRC/AndroidManifest.xml" \
  --java "$BUILD/gen" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  --auto-add-overlay \
  -A "$SRC/assets" \
  "$BUILD/compiled.zip"

echo "==> ecj (compile Java)"
SOURCES="$(find "$SRC/java" "$BUILD/gen" -name '*.java' | sort | tr '\n' ' ')"
java -jar "$BIN/ecj.jar" \
  -source 8 -target 8 -encoding UTF-8 -nowarn \
  -bootclasspath "$AJ" \
  -classpath "$AJ" \
  -d "$BUILD/classes" \
  $SOURCES

echo "==> d8 (dex)"
CLASSES="$(find "$BUILD/classes" -name '*.class' | sort | tr '\n' ' ')"
java -cp "$BIN/d8.jar" com.android.tools.r8.D8 \
  --release \
  --min-api "$MIN_SDK" \
  --lib "$AJ" \
  --output "$BUILD/dex" \
  $CLASSES

echo "==> packaging"
cp "$BUILD/res.apk" "$BUILD/app-unsigned.apk"
(cd "$BUILD/dex" && zip -q -u -X "../app-unsigned.apk" classes.dex)

echo "==> signing"
if [ ! -f "$KEYSTORE" ]; then
  echo "    generating a release keystore at $KEYSTORE"
  keytool -genkeypair \
    -alias leafforge -keyalg RSA -keysize 2048 -sigalg SHA256withRSA \
    -validity 10950 -keystore "$KEYSTORE" -storetype PKCS12 \
    -storepass leafforge -keypass leafforge \
    -dname "CN=$APP_NAME,OU=Mobile,O=LeafForge,C=NG" >/dev/null
fi

java -jar "$BIN/apksigner.jar" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias leafforge \
  --ks-pass pass:leafforge \
  --key-pass pass:leafforge \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$BUILD/LeafForge-Studio.apk" \
  "$BUILD/app-unsigned.apk"

echo "==> verifying"
java -jar "$BIN/apksigner.jar" verify -verbose "$BUILD/LeafForge-Studio.apk" | sed 's/^/    /'

cp "$BUILD/LeafForge-Studio.apk" "$REPO/LeafForge-Studio.apk"

echo
echo "==> done"
ls -lh "$REPO/LeafForge-Studio.apk"
echo "    install with:  adb install -r LeafForge-Studio.apk"
