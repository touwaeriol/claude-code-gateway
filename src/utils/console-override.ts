import { logger } from '../services/logger.js';

/**
 * 重写 console 方法，使其同时输出到控制台和日志文件
 */
export function overrideConsole(): void {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  // 重写 console.log
  console.log = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    // 输出到原始控制台
    originalLog.apply(console, args);
    
    // 同时记录到日志文件
    logger.debug(message);
  };

  // 重写 console.error
  console.error = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    originalError.apply(console, args);
    logger.error(message);
  };

  // 重写 console.warn
  console.warn = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    originalWarn.apply(console, args);
    logger.warn(message);
  };

  // 重写 console.info
  console.info = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    originalInfo.apply(console, args);
    logger.info(message);
  };

  // 重写 console.debug
  console.debug = (...args: any[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    originalDebug.apply(console, args);
    logger.debug(message);
  };
}

/**
 * 恢复原始 console（如果需要）
 */
export function restoreConsole(): void {
  // 实现恢复逻辑（如果需要）
}// Test file change
