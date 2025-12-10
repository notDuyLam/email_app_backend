import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Log the error
    this.logger.error(
      `[ERROR] ${request.method} ${request.url} - Status: ${status}`,
      exception instanceof Error ? exception.stack : exception,
    );

    const errorResponse =
      typeof message === 'string'
        ? { message }
        : (message as { message?: string | string[] });

    response.status(status).json({
      status: 'error',
      code: status.toString(),
      message:
        typeof errorResponse.message === 'string'
          ? errorResponse.message
          : errorResponse.message?.[0] || 'An error occurred',
      data: null,
    });
  }
}

