import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || 'localhost'
  },
  
  claude: {
    configDir: process.env.CLAUDE_CONFIG_DIR || getDefaultConfigDir(),
    apiTimeout: parseInt(process.env.CLAUDE_API_TIMEOUT || '60000', 10),
    maxRetries: parseInt(process.env.CLAUDE_MAX_RETRIES || '3', 10),
    apiBaseUrl: process.env.CLAUDE_API_BASE_URL || 'https://api.anthropic.com'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'claude-proxy.log'
  },
  
  cors: {
    origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
  },
  
  models: {
    mapping: {
      'custom-claude-4-opus': 'claude-opus-4-20250514',
      'custom-claude-4-sonnet': 'claude-sonnet-4-20250514'
    }
  }
};

function getDefaultConfigDir() {
  switch (process.platform) {
    case 'darwin':
      return join(os.homedir(), '.claude-code');
    case 'win32':
      return join(os.homedir(), 'AppData', 'Roaming', 'claude-code');
    default:
      return join(os.homedir(), '.claude-code');
  }
}