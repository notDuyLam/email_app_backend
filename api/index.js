const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const express = require('express');
const { AppModule } = require('../dist/app.module');
const { ValidationPipe } = require('@nestjs/common');
const {
  HttpExceptionFilter,
} = require('../dist/common/filters/http-exception.filter');
const {
  ResponseInterceptor,
} = require('../dist/common/interceptors/response.interceptor');

let cachedApp;

async function createApp() {
  if (cachedApp) {
    return cachedApp;
  }

  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  const { ConfigService } = require('@nestjs/config');
  const configService = app.get(ConfigService);
  const corsOrigin =
    configService.get('app.corsOrigin') || process.env.CORS_ORIGIN || '*';

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.init();
  cachedApp = expressApp;
  return expressApp;
}

module.exports = async (req, res) => {
  try {
    const app = await createApp();
    app(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
