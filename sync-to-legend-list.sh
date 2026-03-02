#!/bin/bash

# Script to pack this library and sync it to legend-list example
# Usage: ./sync-to-legend-list.sh

set -e

TARGET_DIR="$HOME/github/legend-list/example/node_modules/react-native-keyboard-controller"
CURRENT_DIR=$(pwd)

echo "📦 Packing react-native-keyboard-controller..."
echo ""

# Run yarn pack and capture the output filename
# yarn pack outputs the tarball name in the format: "react-native-keyboard-controller-v1.0.0.tgz"
TARBALL=$(yarn pack --filename react-native-keyboard-controller.tgz 2>&1 | grep -o 'react-native-keyboard-controller\.tgz' | tail -1)

if [ -z "$TARBALL" ] || [ ! -f "$TARBALL" ]; then
    echo "❌ Failed to create tarball"
    exit 1
fi

echo "✅ Created $TARBALL"
echo ""

# Check if target directory exists
if [ ! -d "$HOME/github/legend-list/example/node_modules" ]; then
    echo "❌ Target directory $HOME/github/legend-list/example/node_modules does not exist"
    echo "   Make sure legend-list dependencies are installed first"
    rm -f "$TARBALL"
    exit 1
fi

echo "🗑️  Removing old version from legend-list..."
rm -rf "$TARGET_DIR"

echo "📂 Creating target directory..."
mkdir -p "$TARGET_DIR"

echo "📦 Extracting tarball to legend-list..."
# yarn pack creates a tarball with contents in a 'package' subdirectory
# We need to extract and move the contents
tar -xzf "$TARBALL" -C "$TARGET_DIR" --strip-components=1

echo "🧹 Cleaning up tarball..."
rm -f "$TARBALL"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Successfully synced to legend-list!"
echo ""
echo "📍 Location: $TARGET_DIR"
echo ""
echo "💡 Next steps:"
echo "   1. cd ~/github/legend-list/example"
echo "   2. Rebuild/restart your app to see changes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
