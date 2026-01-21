import { registerAs } from '@nestjs/config';

export enum EmbeddingProvider {
  GEMINI = 'gemini',
  LOCAL = 'local', // all-MiniLM-L6-v2
}

export default registerAs('embedding', () => ({
  // Provider: 'gemini' or 'local'
  provider: (process.env.EMBEDDING_PROVIDER || 'local') as EmbeddingProvider,

  // Gemini config (if using Gemini)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_EMBEDDING_MODEL || 'embedding-001',
    dimensions: 768,
  },

  // Local model config (all-MiniLM-L6-v2)
  local: {
    model: process.env.LOCAL_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384, // all-MiniLM-L6-v2 produces 384-dimensional vectors
  },
}));
