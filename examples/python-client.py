#!/usr/bin/env python3
"""
Claude Code Gateway Python 客户端示例
展示如何使用 OpenAI Python SDK 与 Claude Gateway 交互并处理工具调用
"""

import json
import math
import random
from typing import List, Dict, Any
from openai import OpenAI

# 配置客户端
client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="any-key"  # Gateway 不验证 API key
)

# 定义可用工具
AVAILABLE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "mcp__gateway__calculate",
            "description": "执行数学计算，支持 +, -, *, /, ^, sqrt 等运算",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "数学表达式"
                    }
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mcp__gateway__search",
            "description": "搜索信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "default": 5}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mcp__gateway__get_weather",
            "description": "获取天气信息",
            "parameters": {
                "type": "object", 
                "properties": {
                    "location": {"type": "string"},
                    "units": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "default": "celsius"
                    }
                },
                "required": ["location"]
            }
        }
    }
]

class ToolExecutor:
    """模拟工具执行器"""
    
    @staticmethod
    def calculate(expression: str) -> Dict[str, Any]:
        """执行数学计算"""
        try:
            # 简单的安全计算（生产环境应使用更安全的方法）
            # 替换常见数学函数
            safe_expr = expression.replace('^', '**')
            safe_expr = safe_expr.replace('sqrt', 'math.sqrt')
            
            # 只允许安全的数学运算
            allowed_names = {
                'math': math,
                'abs': abs,
                'round': round,
                'min': min,
                'max': max
            }
            
            result = eval(safe_expr, {"__builtins__": {}}, allowed_names)
            
            return {
                "expression": expression,
                "result": result,
                "success": True
            }
        except Exception as e:
            return {
                "expression": expression,
                "error": str(e),
                "success": False
            }
    
    @staticmethod
    def search(query: str, limit: int = 5) -> Dict[str, Any]:
        """模拟搜索"""
        results = []
        for i in range(min(limit, 5)):
            results.append({
                "title": f"{query} - 结果 {i+1}",
                "url": f"https://example.com/search/{i+1}",
                "snippet": f"这是关于 {query} 的第 {i+1} 条搜索结果..."
            })
        
        return {
            "query": query,
            "results": results,
            "total": len(results),
            "success": True
        }
    
    @staticmethod
    def get_weather(location: str, units: str = "celsius") -> Dict[str, Any]:
        """模拟天气查询"""
        temp_c = random.randint(10, 35)
        temp = temp_c if units == "celsius" else int(temp_c * 9/5 + 32)
        
        conditions = ["晴朗", "多云", "小雨", "阴天"]
        
        return {
            "location": location,
            "temperature": temp,
            "units": units,
            "condition": random.choice(conditions),
            "humidity": random.randint(40, 80),
            "wind_speed": random.randint(5, 25),
            "success": True
        }

def execute_tool_call(tool_call) -> Dict[str, Any]:
    """执行工具调用"""
    tool_name = tool_call.function.name.replace("mcp__gateway__", "")
    args = json.loads(tool_call.function.arguments)
    
    print(f"\n🔧 执行工具: {tool_name}")
    print(f"   参数: {args}")
    
    executor = ToolExecutor()
    
    if tool_name == "calculate":
        result = executor.calculate(**args)
    elif tool_name == "search":
        result = executor.search(**args)
    elif tool_name == "get_weather":
        result = executor.get_weather(**args)
    else:
        result = {"error": f"未知工具: {tool_name}", "success": False}
    
    print(f"   结果: {json.dumps(result, ensure_ascii=False)[:100]}...")
    return result

def chat_with_tools(user_message: str) -> str:
    """与 AI 对话，自动处理工具调用"""
    messages = [{"role": "user", "content": user_message}]
    
    print(f"\n👤 用户: {user_message}")
    
    while True:
        # 调用 AI
        response = client.chat.completions.create(
            model="custom-claude-4-sonnet",
            messages=messages,
            tools=AVAILABLE_TOOLS,
            max_tokens=500
        )
        
        message = response.choices[0].message
        messages.append(message.model_dump())
        
        # 检查是否有工具调用
        if message.tool_calls:
            if message.content:
                print(f"\n🤖 AI: {message.content}")
            
            # 执行所有工具调用
            for tool_call in message.tool_calls:
                result = execute_tool_call(tool_call)
                
                # 添加工具结果到消息
                messages.append({
                    "role": "tool",
                    "content": json.dumps(result, ensure_ascii=False),
                    "tool_call_id": tool_call.id
                })
        else:
            # 没有工具调用，返回最终响应
            print(f"\n🤖 AI: {message.content}")
            return message.content

def main():
    """主函数 - 运行示例"""
    print("🚀 Claude Code Gateway Python 客户端示例")
    print("=" * 50)
    
    # 测试场景
    test_cases = [
        "计算 123 * 456 + 789",
        "北京和上海的天气怎么样？",
        "搜索 '机器学习' 相关信息",
        "如果我每月存5000元，年利率3%，复利计算，3年后有多少钱？",
        "帮我计算圆的面积，半径是 5.5",
    ]
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n\n📋 测试 {i}")
        print("-" * 50)
        
        try:
            chat_with_tools(test)
        except Exception as e:
            print(f"\n❌ 错误: {e}")
        
        # 短暂延迟
        import time
        time.sleep(1)
    
    print("\n\n✅ 所有测试完成！")

if __name__ == "__main__":
    main()