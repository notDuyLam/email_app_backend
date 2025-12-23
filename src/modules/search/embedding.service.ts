import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private embeddingModel: any = null;
  private readonly embeddingDimensions = 768; // Gemini embedding-001 produces 768-dimensional vectors
  
  // Rate limiting
  private lastRequestTime: number = 0;
  private readonly minRequestDelay = 1000; // Minimum 1 second between requests (increased to avoid rate limits)
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;
  
  // Quota tracking
  private quotaExceeded: boolean = false;
  private quotaExceededUntil: number = 0; // Timestamp when quota cooldown expires
  private quotaCooldownMs = 60 * 60 * 1000; // 1 hour cooldown (can be increased on repeated errors)
  private quotaErrorLogged: boolean = false; // Track if we've already logged quota error

  constructor(private configService: ConfigService) {
    const geminiConfig = this.configService.get('gemini');
    const apiKey = geminiConfig?.apiKey || process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== '') {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        const modelName = geminiConfig?.embeddingModel || 'embedding-001';
        this.embeddingModel = this.genAI.getGenerativeModel({
          model: modelName,
        });
        this.logger.log(
          `EmbeddingService initialized with model: ${modelName}`,
        );
        // Reset quota state when service is initialized
        this.resetQuotaState();
      } catch (error) {
        this.logger.error(
          `Failed to initialize EmbeddingService: ${error.message}`,
        );
      }
    } else {
      this.logger.warn(
        'GEMINI_API_KEY not configured. Semantic search will be disabled. ' +
        'Fuzzy search (PostgreSQL trigram similarity) will be used instead. ' +
        'This does not require any AI API keys.',
      );
    }
  }

  /**
   * Reset quota state (useful when API key changes or service restarts)
   */
  private resetQuotaState(): void {
    this.quotaExceeded = false;
    this.quotaExceededUntil = 0;
    this.quotaErrorLogged = false;
    this.quotaCooldownMs = 60 * 60 * 1000; // Reset to 1 hour
  }

  /**
   * Generate embedding for a single text
   * @param text - Text to generate embedding for
   * @returns Embedding vector as array of numbers (768 dimensions)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingModel) {
      throw new Error('Embedding model not initialized. Check GEMINI_API_KEY.');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Check if quota is exceeded
    if (this.isQuotaExceeded()) {
      throw new Error('Embedding generation is temporarily disabled due to quota limits. Please try again later.');
    }

    // Rate limiting: ensure minimum delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestDelay) {
      const delay = this.minRequestDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    
    // Additional delay to be extra safe with rate limits
    // Add random jitter (0-500ms) to avoid thundering herd
    const jitter = Math.random() * 500;
    await new Promise((resolve) => setTimeout(resolve, jitter));

    try {
      // Preprocess text: strip HTML, normalize whitespace
      const processedText = this.preprocessText(text);

      // Update last request time
      this.lastRequestTime = Date.now();

      // Generate embedding using Gemini API
      // Note: Gemini embedding API uses embedContent method
      const result = await this.embeddingModel.embedContent(processedText);
      
      // Extract embedding values from the result
      // The structure may vary, so we handle both possible formats
      let embedding: number[];
      if (result.embedding && result.embedding.values) {
        embedding = result.embedding.values;
      } else if (Array.isArray(result.embedding)) {
        embedding = result.embedding;
      } else if (result.embedding && typeof result.embedding === 'object') {
        // Try to extract values from embedding object
        embedding = Object.values(result.embedding) as number[];
      } else {
        throw new Error('Invalid embedding response format');
      }

      if (!embedding || embedding.length !== this.embeddingDimensions) {
        throw new Error(
          `Invalid embedding dimensions: expected ${this.embeddingDimensions}, got ${embedding?.length || 0}`,
        );
      }

      this.logger.debug(
        `Generated embedding for text (${processedText.length} chars)`,
      );
      
      // Reset quota error flag on successful request
      if (this.quotaExceeded) {
        this.quotaExceeded = false;
        this.quotaExceededUntil = 0;
        this.quotaErrorLogged = false;
        this.logger.log('Embedding generation quota restored');
      }
      
      return embedding;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      
      // Check for quota exceeded error (429)
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Quota exceeded')) {
        this.handleQuotaError();
        // Increase cooldown period if we hit quota again
        this.quotaCooldownMs = Math.min(this.quotaCooldownMs * 1.5, 24 * 60 * 60 * 1000); // Max 24 hours
        throw new Error('Embedding generation quota exceeded. Please try again later.');
      }
      
      // Check for rate limit errors (429, 503, etc.)
      if (errorMessage.includes('429') || errorMessage.includes('503') || errorMessage.includes('rate limit')) {
        // Exponential backoff: wait longer before retrying
        const backoffDelay = Math.min(60000, 1000 * Math.pow(2, 3)); // Max 60 seconds
        this.logger.warn(
          `Rate limit detected, will wait ${backoffDelay}ms before next request`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      this.logger.error(`Failed to generate embedding: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Note: Gemini API supports batch requests, but we'll process sequentially
   * to respect rate limits and handle errors gracefully
   * @param texts - Array of texts to generate embeddings for
   * @returns Array of embedding vectors
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (!this.embeddingModel) {
      throw new Error('Embedding model not initialized. Check GEMINI_API_KEY.');
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    const embeddings: number[][] = [];
    const errors: string[] = [];

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(async (text, index) => {
        try {
          const embedding = await this.generateEmbedding(text);
          return { success: true, embedding, index: i + index };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          errors.push(`Text ${i + index}: ${errorMessage}`);
          return { success: false, embedding: null, index: i + index };
        }
      });

      const results = await Promise.all(batchPromises);
      for (const result of results) {
        if (result.success && result.embedding) {
          embeddings[result.index] = result.embedding;
        } else {
          embeddings[result.index] = null as any; // Will be filtered out
        }
      }

      // Small delay between batches to respect rate limits
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Failed to generate ${errors.length} embeddings out of ${texts.length}`,
      );
    }

    // Filter out null embeddings
    return embeddings.filter((e) => e !== null);
  }

  /**
   * Preprocess text before generating embedding
   * - Strip HTML tags
   * - Normalize whitespace
   * - Truncate if too long (Gemini has token limits)
   */
  private preprocessText(text: string): string {
    if (!text) return '';

    // Strip HTML tags
    let processed = text.replace(/<[^>]*>/g, ' ');

    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();

    // Truncate to reasonable length (Gemini embedding-001 can handle up to ~8000 tokens)
    // We'll use a conservative limit of 5000 characters
    const maxLength = 5000;
    if (processed.length > maxLength) {
      processed = processed.substring(0, maxLength);
    }

    return processed;
  }

  /**
   * Check if embedding service is available
   */
  isAvailable(): boolean {
    return this.embeddingModel !== null && !this.isQuotaExceeded();
  }

  /**
   * Check if quota is exceeded
   */
  isQuotaExceeded(): boolean {
    if (!this.quotaExceeded) {
      return false;
    }
    
    // Check if cooldown period has expired
    if (Date.now() >= this.quotaExceededUntil) {
      this.quotaExceeded = false;
      this.quotaExceededUntil = 0;
      this.quotaErrorLogged = false;
      this.logger.log('Embedding generation quota cooldown expired');
      return false;
    }
    
    return true;
  }

  /**
   * Handle quota exceeded error
   */
  private handleQuotaError(): void {
    if (!this.quotaExceeded) {
      this.quotaExceeded = true;
      this.quotaExceededUntil = Date.now() + this.quotaCooldownMs;
      
      // Log warning only once to avoid flooding logs
      if (!this.quotaErrorLogged) {
        this.logger.warn(
          `Embedding generation quota exceeded. Disabling embedding generation for ${this.quotaCooldownMs / 1000 / 60} minutes.`,
        );
        this.quotaErrorLogged = true;
      }
    }
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.embeddingDimensions;
  }
}

