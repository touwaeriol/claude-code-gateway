const claudeCode = require('@anthropic-ai/claude-code');

console.log('Claude Code Proxy项目已初始化');
console.log('已成功引入@anthropic-ai/claude-code依赖');

// 在这里可以添加您的代码逻辑
async function main() {
    try {
        // 使用claude-code的示例代码
        console.log('项目准备就绪，可以开始使用claude-code功能');
    } catch (error) {
        console.error('错误:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main }; 