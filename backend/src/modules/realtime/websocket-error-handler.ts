import { ErrorMessage } from './dto/error.schema';
import { randomUUID } from 'crypto';

export class WebSocketErrorHandler {
  static createErrorMessage(code: string, message: string, details?: unknown): ErrorMessage {
    return {
      id: randomUUID(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'error',
      payload: {
        code,
        message,
        details
      }
    };
  }
} 