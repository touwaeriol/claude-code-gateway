import express from 'express';
import { config } from '../config/index.js';
import { MessageConverter } from '../converters/message-converter.js';
import { logger } from '../utils/logger.js';

export function createOpenAIRoutes(claudeClient) {
  const router = express.Router();

  // Chat completions endpoint
  router.post('/v1/chat/completions', async (req, res) => {
    try {
      const {
        model,
        messages,
        temperature,
        max_tokens,
        stream = false,
        tools,
        tool_choice,
        functions, // 旧版 function calling
        function_call, // 旧版 function calling
        ...additionalParams
      } = req.body;

      // 验证模型
      const claudeModel = config.models.mapping[model];
      if (!claudeModel) {
        return res.status(400).json({
          error: {
            message: `The model '${model}' does not exist`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

      // 处理工具定义（支持新旧两种格式）
      let openAITools = tools;
      if (!openAITools && functions) {
        // 转换旧版 functions 格式到新版 tools 格式
        openAITools = functions.map(fn => ({
          type: 'function',
          function: fn
        }));
      }
      
      // 转换工具定义
      const claudeTools = MessageConverter.openAIToolsToClaude(openAITools);
      
      // 转换消息格式
      const { messages: claudeMessages, system } = MessageConverter.openAIToClaude(messages, openAITools);

      // 构建请求参数
      const requestParams = {
        model: claudeModel,
        temperature,
        max_tokens,
        system: system,
        tools: claudeTools,
        additionalParams
      };

      // 处理流式响应
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        try {
          const stream = await claudeClient.createStreamingMessage(claudeMessages, requestParams);
          await handleStreamResponse(stream, res, model);
        } catch (error) {
          logger.error('Streaming error:', error);
          res.write(`data: ${JSON.stringify(MessageConverter.errorToOpenAI(error))}\n\n`);
          res.end();
        }
      } else {
        // 非流式响应
        const claudeResponse = await claudeClient.createMessage(claudeMessages, requestParams);
        const openAIResponse = MessageConverter.claudeResponseToOpenAI(claudeResponse, model);
        res.json(openAIResponse);
      }
    } catch (error) {
      logger.error('Chat completion error:', error);
      const statusCode = error.status || 500;
      res.status(statusCode).json(MessageConverter.errorToOpenAI(error));
    }
  });

  // Models endpoint
  router.get('/v1/models', (req, res) => {
    const models = Object.keys(config.models.mapping).map(modelId => ({
      id: modelId,
      object: 'model',
      created: 1677610602,
      owned_by: 'anthropic',
      permission: [],
      root: modelId,
      parent: null
    }));

    res.json({
      object: 'list',
      data: models
    });
  });

  return router;
}

// 处理流式响应
async function handleStreamResponse(stream, res, requestModel) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const streamState = {}; // 用于跟踪流式工具调用状态

    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            res.end();
            resolve();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const openAIChunk = MessageConverter.claudeStreamChunkToOpenAI(parsed, requestModel, streamState);
            if (openAIChunk) {
              res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
            }
          } catch (error) {
            logger.error('Error parsing stream chunk:', error);
          }
        }
      }
    });

    stream.on('error', (error) => {
      logger.error('Stream error:', error);
      res.write(`data: ${JSON.stringify(MessageConverter.errorToOpenAI(error))}\n\n`);
      res.end();
      reject(error);
    });

    stream.on('end', () => {
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
      resolve();
    });
  });
}