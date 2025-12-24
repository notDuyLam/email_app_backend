import { registerAs } from '@nestjs/config';

export default registerAs('gemini', () => ({
  apiKey: process.env.GEMINI_API_KEY || '',
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'embedding-001',
  maxRetries: parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10),
  timeout: parseInt(process.env.GEMINI_TIMEOUT || '30000', 10),
}));

