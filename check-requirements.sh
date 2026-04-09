#!/bin/bash

# Elasticsearch Migration Tool - Requirements Checker
# This script checks if all prerequisites are met

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Elasticsearch Migration Tool - Requirements Check       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0
WARNINGS=0

# Check Node.js
echo "🔍 Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "   ✅ Node.js found: $NODE_VERSION"
    
    # Extract major version
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo "   ⚠️  Warning: Node.js 18+ recommended (current: $NODE_VERSION)"
        WARNINGS=$((WARNINGS+1))
    fi
else
    echo "   ❌ Node.js not found"
    echo "      Install: https://nodejs.org/"
    ERRORS=$((ERRORS+1))
fi
echo ""

# Check npm
echo "🔍 Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "   ✅ npm found: v$NPM_VERSION"
else
    echo "   ❌ npm not found"
    ERRORS=$((ERRORS+1))
fi
echo ""

# Check Redis
echo "🔍 Checking Redis..."
if command -v redis-cli &> /dev/null; then
    echo "   ✅ redis-cli found"
    
    # Try to ping Redis
    if redis-cli ping &> /dev/null; then
        echo "   ✅ Redis server is running"
    else
        echo "   ⚠️  Redis server is not running"
        echo "      Start with: sudo systemctl start redis-server"
        WARNINGS=$((WARNINGS+1))
    fi
else
    echo "   ❌ Redis not found"
    echo "      Install: sudo apt-get install redis-server"
    ERRORS=$((ERRORS+1))
fi
echo ""

# Check if node_modules exists
echo "🔍 Checking dependencies..."
if [ -d "node_modules" ]; then
    echo "   ✅ Dependencies installed"
else
    echo "   ⚠️  Dependencies not installed"
    echo "      Run: npm install"
    WARNINGS=$((WARNINGS+1))
fi
echo ""

# Check if .env exists
echo "🔍 Checking configuration..."
if [ -f ".env" ]; then
    echo "   ✅ .env file exists"
else
    echo "   ⚠️  .env file not found"
    echo "      Run: cp .env.example .env"
    WARNINGS=$((WARNINGS+1))
fi
echo ""

# Check directories
echo "🔍 Checking directories..."
if [ -d "logs" ]; then
    echo "   ✅ logs/ directory exists"
else
    echo "   ℹ️  Creating logs/ directory..."
    mkdir -p logs
    echo "   ✅ logs/ directory created"
fi

if [ -d "data" ]; then
    echo "   ✅ data/ directory exists"
else
    echo "   ℹ️  Creating data/ directory..."
    mkdir -p data
    echo "   ✅ data/ directory created"
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════"
echo "Summary:"
echo "   Errors: $ERRORS"
echo "   Warnings: $WARNINGS"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ All requirements met! You're ready to run the application."
    echo ""
    echo "Next steps:"
    echo "   1. Configure .env file with your Elasticsearch settings"
    echo "   2. Run: npm start"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  Some warnings found. The application may run but with limitations."
    echo ""
    echo "Recommended actions:"
    if [ $WARNINGS -gt 0 ]; then
        echo "   - Review warnings above and fix them"
    fi
    echo "   - Configure .env file"
    echo "   - Run: npm start"
    exit 0
else
    echo "❌ Critical errors found. Please fix them before running the application."
    echo ""
    echo "Required actions:"
    echo "   - Install missing dependencies (see errors above)"
    echo "   - Run this script again to verify"
    exit 1
fi
