#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME=""
BUNDLE_ID=""
VERSION="1.0.0"
ICON_PATH=""
OUTPUT_DIR="$SCRIPT_DIR/build"

usage() {
    cat <<'EOF'
Usage: build.sh --name NAME --bundle-id BUNDLE_ID --output OUTPUT_DIR [--version VERSION] [--icon ICON_PATH]
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name)
            APP_NAME="${2:-}"
            shift 2
            ;;
        --bundle-id)
            BUNDLE_ID="${2:-}"
            shift 2
            ;;
        --version)
            VERSION="${2:-}"
            shift 2
            ;;
        --icon)
            ICON_PATH="${2:-}"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="${2:-}"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: Unknown argument '$1'" >&2
            usage
            exit 1
            ;;
    esac
done

if [[ -z "$APP_NAME" || -z "$BUNDLE_ID" || -z "$OUTPUT_DIR" ]]; then
    echo "Error: --name, --bundle-id, and --output are required" >&2
    usage
    exit 1
fi

if [[ -n "$ICON_PATH" && ! -f "$ICON_PATH" ]]; then
    echo "Error: Icon file not found: $ICON_PATH" >&2
    exit 1
fi

echo "Building $APP_NAME..."

mkdir -p "$OUTPUT_DIR"
APP_BUNDLE="$OUTPUT_DIR/${APP_NAME}.app"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

sed -e "s/{{BUNDLE_ID}}/$BUNDLE_ID/g" \
    -e "s/{{APP_NAME}}/$APP_NAME/g" \
    -e "s/{{VERSION}}/$VERSION/g" \
    "$SCRIPT_DIR/Info.plist.template" > "$APP_BUNDLE/Contents/Info.plist"

if [[ -n "$ICON_PATH" ]]; then
    echo "Converting icon..."
    ICONSET_DIR="$OUTPUT_DIR/AppIcon.iconset"
    mkdir -p "$ICONSET_DIR"

    sips -z 16 16 "$ICON_PATH" --out "$ICONSET_DIR/icon_16x16.png" 2>/dev/null
    sips -z 32 32 "$ICON_PATH" --out "$ICONSET_DIR/icon_16x16@2x.png" 2>/dev/null
    sips -z 32 32 "$ICON_PATH" --out "$ICONSET_DIR/icon_32x32.png" 2>/dev/null
    sips -z 64 64 "$ICON_PATH" --out "$ICONSET_DIR/icon_32x32@2x.png" 2>/dev/null
    sips -z 128 128 "$ICON_PATH" --out "$ICONSET_DIR/icon_128x128.png" 2>/dev/null
    sips -z 256 256 "$ICON_PATH" --out "$ICONSET_DIR/icon_128x128@2x.png" 2>/dev/null
    sips -z 256 256 "$ICON_PATH" --out "$ICONSET_DIR/icon_256x256.png" 2>/dev/null
    sips -z 512 512 "$ICON_PATH" --out "$ICONSET_DIR/icon_256x256@2x.png" 2>/dev/null
    sips -z 512 512 "$ICON_PATH" --out "$ICONSET_DIR/icon_512x512.png" 2>/dev/null
    sips -z 1024 1024 "$ICON_PATH" --out "$ICONSET_DIR/icon_512x512@2x.png" 2>/dev/null

    iconutil -c icns "$ICONSET_DIR" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
    rm -rf "$ICONSET_DIR"
else
    echo "No icon provided, using default macOS icon"
fi

echo "Compiling..."
swiftc \
    "$SCRIPT_DIR/main.swift" \
    -o "$APP_BUNDLE/Contents/MacOS/$APP_NAME" \
    -target x86_64-apple-macos10.15 \
    -framework AppKit

chmod 755 "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
xattr -dr com.apple.quarantine "$APP_BUNDLE" 2>/dev/null || true

echo ""
echo "Build complete: $APP_BUNDLE"