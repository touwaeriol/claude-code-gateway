import { Server } from 'http';
import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function setupGracefulShutdown(server: Server, port: number): void {
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n⏹️  正在优雅关闭服务器...');

    server.close(() => {
      console.log('✅ 服务器已关闭');
      process.exit(0);
    });

    // 强制关闭超时
    setTimeout(() => {
      console.error('❌ 强制关闭服务器');
      process.exit(1);
    }, 5000);
  };

  // 捕获各种退出信号
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGUSR1', shutdown);
  process.on('SIGUSR2', shutdown);

  // 捕获未处理的错误
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    shutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason);
    shutdown();
  });
}

/**
 * 检查端口是否被占用
 */
export async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // 端口被占用
      } else {
        resolve(true); // 其他错误，假设端口可用
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true); // 端口可用
    });
    
    server.listen(port);
  });
}

/**
 * 杀死占用指定端口的进程
 */
export async function killPortProcess(port: number): Promise<void> {
  const platform = process.platform;
  
  let command: string;
  if (platform === 'darwin' || platform === 'linux') {
    // macOS 和 Linux
    command = `lsof -t -i:${port} | xargs kill -9`;
  } else if (platform === 'win32') {
    // Windows
    command = `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F`;
  } else {
    console.warn('不支持的操作系统');
    return;
  }
  
  try {
    await execAsync(command);
    console.log(`✅ 已清理端口 ${port}`);
  } catch (error: any) {
    if (error.code !== 1) {
      console.warn(`无法杀死端口 ${port} 上的进程:`, error.message);
    }
  }
}