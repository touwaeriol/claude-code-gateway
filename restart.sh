#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PORT=${PORT:-3000}

echo -e "${YELLOW}🔄 重启 Claude Code Gateway...${NC}"

# 查找并杀死占用端口的进程
echo -e "${YELLOW}正在清理端口 $PORT...${NC}"
lsof -ti:$PORT | xargs kill -9 2>/dev/null

# 等待端口释放
sleep 1

# 检查端口是否已释放
if lsof -ti:$PORT >/dev/null 2>&1; then
    echo -e "${RED}❌ 端口 $PORT 仍被占用${NC}"
    echo "占用进程:"
    lsof -i:$PORT
    exit 1
fi

echo -e "${GREEN}✅ 端口 $PORT 已清理${NC}"

# 启动服务器
echo -e "${YELLOW}启动服务器...${NC}"
npm run dev