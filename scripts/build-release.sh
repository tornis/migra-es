#!/bin/bash

# Build script for creating release packages
# Usage: ./scripts/build-release.sh [version]

set -e

VERSION=${1:-"1.0.0"}
RELEASE_DIR="release"
DIST_DIR="dist"

echo "🚀 Building ES Migration Tool v${VERSION}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf ${RELEASE_DIR}
rm -rf ${DIST_DIR}
mkdir -p ${RELEASE_DIR}
mkdir -p ${DIST_DIR}

# Build binaries
echo "📦 Building binaries..."
npm run build:all

# Check if binaries were created
if [ ! -f "${DIST_DIR}/es-migrate-linux" ]; then
    echo "❌ Linux binary not found!"
    exit 1
fi

echo "✅ Binaries built successfully!"

# Create release packages
echo "📦 Creating release packages..."

# Linux package
echo "  → Linux package..."
mkdir -p ${RELEASE_DIR}/linux
cp ${DIST_DIR}/es-migrate-linux ${RELEASE_DIR}/linux/es-migrate
cp .env.example ${RELEASE_DIR}/linux/
cp README.md ${RELEASE_DIR}/linux/
cp INSTALL.md ${RELEASE_DIR}/linux/
cp QUICKSTART.md ${RELEASE_DIR}/linux/
tar -czf ${RELEASE_DIR}/es-migrate-v${VERSION}-linux-x64.tar.gz -C ${RELEASE_DIR}/linux .
rm -rf ${RELEASE_DIR}/linux

# macOS package
if [ -f "${DIST_DIR}/es-migrate-macos" ]; then
    echo "  → macOS package..."
    mkdir -p ${RELEASE_DIR}/macos
    cp ${DIST_DIR}/es-migrate-macos ${RELEASE_DIR}/macos/es-migrate
    cp .env.example ${RELEASE_DIR}/macos/
    cp README.md ${RELEASE_DIR}/macos/
    cp INSTALL.md ${RELEASE_DIR}/macos/
    cp QUICKSTART.md ${RELEASE_DIR}/macos/
    tar -czf ${RELEASE_DIR}/es-migrate-v${VERSION}-macos-x64.tar.gz -C ${RELEASE_DIR}/macos .
    rm -rf ${RELEASE_DIR}/macos
fi

# Windows package
if [ -f "${DIST_DIR}/es-migrate-win.exe" ]; then
    echo "  → Windows package..."
    mkdir -p ${RELEASE_DIR}/windows
    cp ${DIST_DIR}/es-migrate-win.exe ${RELEASE_DIR}/windows/es-migrate.exe
    cp .env.example ${RELEASE_DIR}/windows/
    cp README.md ${RELEASE_DIR}/windows/
    cp INSTALL.md ${RELEASE_DIR}/windows/
    cp QUICKSTART.md ${RELEASE_DIR}/windows/
    cd ${RELEASE_DIR}/windows && zip -r ../es-migrate-v${VERSION}-windows-x64.zip . && cd ../..
    rm -rf ${RELEASE_DIR}/windows
fi

# Generate checksums
echo "🔐 Generating checksums..."
cd ${RELEASE_DIR}
sha256sum *.tar.gz *.zip > checksums.txt 2>/dev/null || shasum -a 256 *.tar.gz *.zip > checksums.txt
cd ..

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Release packages created successfully!"
echo ""
echo "📦 Packages:"
ls -lh ${RELEASE_DIR}/*.tar.gz ${RELEASE_DIR}/*.zip 2>/dev/null || ls -lh ${RELEASE_DIR}/*.tar.gz
echo ""
echo "🔐 Checksums:"
cat ${RELEASE_DIR}/checksums.txt
echo ""
echo "🎉 Done! Release v${VERSION} is ready for distribution."
