#!/bin/bash
# ============================================================
# Noah Agent Platform - One-Click Setup
# Clone → ./setup.sh → fill API key → npm run dev → done!
# ============================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo "🚀 Setting up Noah Agent Platform..."
echo ""

# ============================================================
# 1. Check Python version (need 3.11+)
# ============================================================
check_python() {
    local cmd=$1
    if command -v "$cmd" &> /dev/null; then
        local version=$($cmd --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
        local major=$(echo "$version" | cut -d. -f1)
        local minor=$(echo "$version" | cut -d. -f2)
        if [ "$major" -ge 3 ] && [ "$minor" -ge 11 ]; then
            echo "$cmd"
            return 0
        fi
    fi
    return 1
}

PYTHON_CMD=""
for cmd in python3.13 python3.12 python3.11 python3 python; do
    if PYTHON_CMD=$(check_python "$cmd"); then
        break
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo -e "${RED}❌ Python 3.11+ is required but not found.${NC}"
    echo "   Please install Python 3.11 or higher:"
    echo "   - macOS: brew install python@3.13"
    echo "   - Ubuntu: sudo apt install python3.13"
    echo "   - Or download from https://www.python.org/downloads/"
    exit 1
fi

PY_VERSION=$($PYTHON_CMD --version)
echo -e "${GREEN}✓${NC} Found $PY_VERSION ($PYTHON_CMD)"

# ============================================================
# 2. Create virtual environment
# ============================================================
VENV_PATH="apps/api/.venv"

if [ -d "$VENV_PATH" ]; then
    echo -e "${GREEN}✓${NC} Virtual environment already exists at $VENV_PATH"
else
    echo "  Creating virtual environment..."
    $PYTHON_CMD -m venv "$VENV_PATH"
    echo -e "${GREEN}✓${NC} Virtual environment created at $VENV_PATH"
fi

# ============================================================
# 3. Install dependencies
# ============================================================
echo "  Installing dependencies (this may take a minute)..."

# Prefer uv for speed, fall back to pip
if command -v uv &> /dev/null; then
    uv pip install -r apps/api/requirements.txt --python "$VENV_PATH/bin/python" -q
    echo -e "${GREEN}✓${NC} Dependencies installed (via uv)"
else
    "$VENV_PATH/bin/pip" install -r apps/api/requirements.txt -q
    echo -e "${GREEN}✓${NC} Dependencies installed (via pip)"
fi

# ============================================================
# 4. Set up environment file
# ============================================================
if [ -f ".env.dev" ]; then
    echo -e "${GREEN}✓${NC} .env.dev already exists (preserved)"
else
    cp .env.example .env.dev
    echo -e "${GREEN}✓${NC} Created .env.dev from .env.example"
    echo ""
    echo -e "${YELLOW}📝 ACTION REQUIRED:${NC}"
    echo "   Edit .env.dev and set your OpenAI API key:"
    echo ""
    echo "   OPENAI_API_KEY=sk-your-real-key-here"
    echo ""
    echo "   Get a key at: https://platform.openai.com/api-keys"
    echo "   国内用户可设置 OPENAI_BASE_URL 使用代理（如 SiliconFlow/DeepSeek）"
fi

# ============================================================
# Done!
# ============================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "   Next steps:"
echo "   1. Edit .env.dev → fill in OPENAI_API_KEY"
echo "   2. Run: npm run dev"
echo "   3. Open: http://localhost:8000/ui"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
