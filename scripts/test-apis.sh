#!/bin/bash

# Lumi Server API 完整测试脚本
# 测试所有 API 端点并验证响应格式

BASE_URL="http://localhost:3001"
USER_ID="test-user-001"
TEST_RESULTS=()

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="${5:-200}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    echo -e "\n${YELLOW}[TEST $TOTAL_TESTS]${NC} $name"
    echo "  Method: $method $endpoint"

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -H "x-user-id: $USER_ID" "$BASE_URL$endpoint")
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X DELETE -H "x-user-id: $USER_ID" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -H "x-user-id: $USER_ID" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    # 检查 HTTP 状态码
    if [ "$http_code" = "$expected_status" ]; then
        # 检查响应是否包含 JSend 格式
        if echo "$body" | jq -e '.status' > /dev/null 2>&1; then
            status_field=$(echo "$body" | jq -r '.status')
            if [ "$status_field" = "success" ] || [ "$status_field" = "fail" ] || [ "$status_field" = "error" ]; then
                echo -e "  ${GREEN}✓ PASSED${NC} (HTTP $http_code, JSend: $status_field)"
                PASSED_TESTS=$((PASSED_TESTS + 1))
                TEST_RESULTS+=("✓ $name")
                return 0
            fi
        fi
    fi

    echo -e "  ${RED}✗ FAILED${NC} (HTTP $http_code, Expected: $expected_status)"
    echo "  Response: $body" | head -c 200
    FAILED_TESTS=$((FAILED_TESTS + 1))
    TEST_RESULTS+=("✗ $name")
    return 1
}

echo "======================================"
echo "  Lumi Server API 完整测试"
echo "======================================"
echo "Base URL: $BASE_URL"
echo "User ID: $USER_ID"

# ========================================
# 健康检查路由
# ========================================
echo -e "\n${YELLOW}━━━ 1. 健康检查路由 ━━━${NC}"

test_api "根路径 API 信息" "GET" "/"
test_api "基础健康检查" "GET" "/health"
test_api "详细健康检查" "GET" "/health/detailed"

# ========================================
# 生成请求路由
# ========================================
echo -e "\n${YELLOW}━━━ 2. 生成请求路由 ━━━${NC}"

test_api "获取请求列表" "GET" "/api/requests"

# 创建新请求并保存 ID
echo -e "\n${YELLOW}创建新的生成请求...${NC}"
CREATE_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "x-user-id: $USER_ID" \
    -d '{"prompt":"测试用可爱小猫","optimizePrompt":false}' \
    "$BASE_URL/api/requests")

REQUEST_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.request.id')
echo "生成的 REQUEST_ID: $REQUEST_ID"

if [ "$REQUEST_ID" != "null" ] && [ -n "$REQUEST_ID" ]; then
    test_api "创建生成请求" "POST" "/api/requests" '{"prompt":"测试","optimizePrompt":false}' 201
    test_api "获取请求详情" "GET" "/api/requests/$REQUEST_ID"
    # 暂时不测试删除,因为可能会影响后续测试
    # test_api "删除生成请求" "DELETE" "/api/requests/$REQUEST_ID"
else
    echo -e "${RED}✗ 无法获取 REQUEST_ID,跳过相关测试${NC}"
fi

# ========================================
# 模型管理路由
# ========================================
echo -e "\n${YELLOW}━━━ 3. 模型管理路由 ━━━${NC}"

test_api "获取用户模型列表" "GET" "/api/models/me"
test_api "获取公开模型列表" "GET" "/api/models/public"
test_api "获取公开模型(按最新排序)" "GET" "/api/models/public?sortBy=latest"
test_api "获取公开模型(按热门排序)" "GET" "/api/models/public?sortBy=popular"

# 测试创建模型 (需要有完成的图片)
echo -e "\n${YELLOW}注意: 创建模型需要图片生成完成,跳过此测试${NC}"
# test_api "创建3D模型" "POST" "/api/models" "{\"requestId\":\"$REQUEST_ID\",\"imageIndex\":0}"

# 测试模型详情 (需要有实际的模型)
echo -e "\n${YELLOW}注意: 模型操作需要实际的模型ID,跳过部分测试${NC}"

# ========================================
# 交互功能路由
# ========================================
echo -e "\n${YELLOW}━━━ 4. 交互功能路由 ━━━${NC}"

test_api "获取点赞的模型列表" "GET" "/api/me/liked-models"
test_api "获取收藏的模型列表" "GET" "/api/me/favorited-models"

# 需要实际的模型 ID 才能测试点赞/收藏
echo -e "\n${YELLOW}注意: 点赞/收藏需要实际的模型ID,跳过这些测试${NC}"

# ========================================
# 错误处理测试
# ========================================
echo -e "\n${YELLOW}━━━ 5. 错误处理测试 ━━━${NC}"

test_api "404 - 不存在的端点" "GET" "/api/not-found" "" 404
test_api "404 - 不存在的请求ID" "GET" "/api/requests/invalid-id" "" 404
test_api "400 - 创建请求缺少prompt" "POST" "/api/requests" '{}' 400

# ========================================
# 测试总结
# ========================================
echo -e "\n======================================"
echo "  测试结果汇总"
echo "======================================"
echo -e "总测试数: $TOTAL_TESTS"
echo -e "${GREEN}通过: $PASSED_TESTS${NC}"
echo -e "${RED}失败: $FAILED_TESTS${NC}"
echo -e "通过率: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"

echo -e "\n详细结果:"
for result in "${TEST_RESULTS[@]}"; do
    echo "  $result"
done

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 所有测试通过!${NC}"
    exit 0
else
    echo -e "\n${RED}⚠️  有 $FAILED_TESTS 个测试失败${NC}"
    exit 1
fi
