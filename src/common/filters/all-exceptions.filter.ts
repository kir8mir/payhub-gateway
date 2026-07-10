import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CORRELATION_ID_HEADER } from '../interceptors/correlation-id.interceptor';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const correlationId =
      (request.headers[CORRELATION_ID_HEADER] as string | undefined) ??
      randomUUID();

    const { statusCode, error, message } = this.resolveError(exception);

    this.logger.error({
      correlationId,
      statusCode,
      error,
      message,
      path: request.url,
      method: request.method,
    });

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      correlationId,
    });
  }

  private resolveError(exception: unknown): {
    statusCode: number;
    error: string;
    message: string;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();

      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? Array.isArray((body as Record<string, unknown>).message)
            ? ((body as Record<string, unknown>).message as string[]).join(', ')
            : String((body as Record<string, unknown>).message)
          : exception.message;

      return {
        statusCode,
        error: HttpStatus[statusCode] ?? 'Error',
        message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    };
  }
}
