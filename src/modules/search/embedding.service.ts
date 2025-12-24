import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { EmbeddingProvider } from '../../configs/embedding.config';

// Dynamic import type for transformers
type FeatureExtractionPipeline = any;

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  
  // Provider type
  private provider: EmbeddingProvider = EmbeddingProvider.LOCAL;
  private embeddingDimensions = 384; // Default to local model dimensions
  
  // Gemini-specific
  private genAI: GoogleGenerativeAI | null = null;
  private geminiModel: any = null;
  
  // Local model (all-MiniLM-L6-v2)
  private localModel: FeatureExtractionPipeline | null = null;
  private isLocalModelLoading = false;
  
  // Rate limiting (only for Gemini)
  private lastRequestTime: number = 0;
  private readonly minRequestDelay = 1000;
  
  // Quota tracking (only for Gemini)
  private quotaExceeded: boolean = false;
  private quotaExceededUntil: number = 0;
  private quotaCooldownMs = 60 * 60 * 1000;
  private quotaErrorLogged: boolean = false;

  constructor(private configService: ConfigService) {
    const embeddingConfig = this.configService.get('embedding');
    this.provider = embeddingConfig?.provider || EmbeddingProvider.LOCAL;
    
    if (this.provider === EmbeddingProvider.GEMINI) {
      this.initializeGemini(embeddingConfig);
    } else {
      this.embeddingDimensions = embeddingConfig?.local?.dimensions || 384;
      this.logger.log(
        `EmbeddingService will use LOCAL model: ${embeddingConfig?.local?.model || 'Xenova/all-MiniLM-L6-v2'} (${this.embeddingDimensions} dimensions)`,
      );
    }
  }

  async onModuleInit() {
    if (this.provider === EmbeddingProvider.LOCAL) {
      await this.initializeLocalModel();
    }
  }

  /**
   * Initialize Gemini embedding model
   */
  private initializeGemini(embeddingConfig: any): void {
    const apiKey = embeddingConfig?.gemini?.apiKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === '') {
      this.logger.warn(
        'GEMINI_API_KEY not configured. Falling back to LOCAL embedding model.',
      );
      this.provider = EmbeddingProvider.LOCAL;
      this.embeddingDimensions = 384;
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      const modelName = embeddingConfig?.gemini?.model || 'embedding-001';
      this.geminiModel = this.genAI.getGenerativeModel({
        model: modelName,
      });
      this.embeddingDimensions = embeddingConfig?.gemini?.dimensions || 768;
      this.logger.log(
        `EmbeddingService initialized with GEMINI model: ${modelName} (${this.embeddingDimensions} dimensions)`,
      );
      this.resetQuotaState();
    } catch (error) {
      this.logger.error(
        `Failed to initialize Gemini EmbeddingService: ${error.message}. Falling back to LOCAL model.`,
      );
      this.provider = EmbeddingProvider.LOCAL;
      this.embeddingDimensions = 384;
    }
  }

  /**
   * Initialize local embedding model (all-MiniLM-L6-v2)
   */
  private async initializeLocalModel(): Promise<void> {
    if (this.localModel || this.isLocalModelLoading) {
      return;
    }

    this.isLocalModelLoading = true;
    const embeddingConfig = this.configService.get('embedding');
    const modelName = embeddingConfig?.local?.model || 'Xenova/all-MiniLM-L6-v2';

    try {
      this.logger.log(`Loading local embedding model: ${modelName}...`);
      
      // Dynamic import of @xenova/transformers (ES Module)
      const { pipeline } = await import('@xenova/transformers');
      
      // Load the model - this will download it on first use (~90MB)
      // Subsequent runs will use cached model
      this.localModel = await pipeline(
        'feature-extraction',
        modelName,
        {
          quantized: true, // Use quantized model for smaller size and faster inference
        },
      );

      this.logger.log(
        `Local embedding model loaded successfully: ${modelName} (${this.embeddingDimensions} dimensions)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to load local embedding model: ${error.message}`,
      );
      this.localModel = null;
    } finally {
      this.isLocalModelLoading = false;
    }
  }

  /**
   * Reset quota state (for Gemini only)
   */
  private resetQuotaState(): void {
    this.quotaExceeded = false;
    this.quotaExceededUntil = 0;
    this.quotaErrorLogged = false;
    this.quotaCooldownMs = 60 * 60 * 1000;
  }

  /**
   * Generate embedding for a single text
   * @param text - Text to generate embedding for
   * @returns Embedding vector as array of numbers
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    if (this.provider === EmbeddingProvider.GEMINI) {
      return this.generateEmbeddingGemini(text);
    } else {
      return this.generateEmbeddingLocal(text);
    }
  }

  /**
   * Generate embedding using Gemini API
   */
  private async generateEmbeddingGemini(text: string): Promise<number[]> {
    if (!this.geminiModel) {
      throw new Error('Gemini embedding model not initialized. Check GEMINI_API_KEY.');
    }

    // Check if quota is exceeded
    if (this.isQuotaExceeded()) {
      throw new Error('Embedding generation is temporarily disabled due to quota limits. Please try again later.');
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestDelay) {
      const delay = this.minRequestDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const jitter = Math.random() * 500;
    await new Promise((resolve) => setTimeout(resolve, jitter));

    try {
      const processedText = this.preprocessText(text, 5000); // Gemini limit
      this.lastRequestTime = Date.now();

      const result = await this.geminiModel.embedContent(processedText);

      let embedding: number[];
      if (result.embedding && result.embedding.values) {
        embedding = result.embedding.values;
      } else if (Array.isArray(result.embedding)) {
        embedding = result.embedding;
      } else if (result.embedding && typeof result.embedding === 'object') {
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
        `Generated Gemini embedding for text (${processedText.length} chars)`,
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
        this.quotaCooldownMs = Math.min(this.quotaCooldownMs * 1.5, 24 * 60 * 60 * 1000);
        throw new Error('Embedding generation quota exceeded. Please try again later.');
      }

      // Check for rate limit errors
      if (errorMessage.includes('429') || errorMessage.includes('503') || errorMessage.includes('rate limit')) {
        const backoffDelay = Math.min(60000, 1000 * Math.pow(2, 3));
        this.logger.warn(
          `Rate limit detected, will wait ${backoffDelay}ms before next request`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      this.logger.error(`Failed to generate Gemini embedding: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Generate embedding using local model (all-MiniLM-L6-v2)
   */
  private async generateEmbeddingLocal(text: string): Promise<number[]> {
    // Ensure model is loaded
    if (!this.localModel) {
      if (this.isLocalModelLoading) {
        // Wait for model to finish loading
        let attempts = 0;
        while (this.isLocalModelLoading && attempts < 30) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;
        }
      }
      
      if (!this.localModel) {
        await this.initializeLocalModel();
      }
      
      if (!this.localModel) {
        throw new Error('Local embedding model failed to load. Please check logs.');
      }
    }

    try {
      const processedText = this.preprocessText(text, 512); // Local model token limit
      
      // Generate embedding using local model
      const result = await this.localModel(processedText, {
        pooling: 'mean', // Mean pooling for sentence embeddings
        normalize: true, // Normalize embeddings for cosine similarity
      });

      // Extract embedding values
      // The result is a tensor, convert to array
      let embedding: number[];
      if (result && result.data) {
        embedding = Array.from(result.data);
      } else if (Array.isArray(result)) {
        embedding = result;
      } else if (result && typeof result === 'object' && 'data' in result) {
        embedding = Array.from((result as any).data);
      } else {
        throw new Error('Invalid embedding response format from local model');
      }

      if (!embedding || embedding.length !== this.embeddingDimensions) {
        throw new Error(
          `Invalid embedding dimensions: expected ${this.embeddingDimensions}, got ${embedding?.length || 0}`,
        );
      }

      this.logger.debug(
        `Generated local embedding for text (${processedText.length} chars)`,
      );

      return embedding;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate local embedding: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    if (this.provider === EmbeddingProvider.LOCAL) {
      // Local model can process batches efficiently
      return this.generateEmbeddingsBatchLocal(texts);
    } else {
      // Gemini: process sequentially to respect rate limits
      return this.generateEmbeddingsBatchGemini(texts);
    }
  }

  /**
   * Generate embeddings batch using Gemini (sequential)
   */
  private async generateEmbeddingsBatchGemini(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    const errors: string[] = [];

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
          embeddings[result.index] = null as any;
        }
      }

      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Failed to generate ${errors.length} embeddings out of ${texts.length}`,
      );
    }

    return embeddings.filter((e) => e !== null);
  }

  /**
   * Generate embeddings batch using local model (parallel)
   */
  private async generateEmbeddingsBatchLocal(texts: string[]): Promise<number[][]> {
    if (!this.localModel) {
      await this.initializeLocalModel();
      if (!this.localModel) {
        throw new Error('Local embedding model failed to load.');
      }
    }

    try {
      const processedTexts = texts.map(text => this.preprocessText(text, 512));
      
      // Process all texts in parallel (local model can handle this)
      const results = await Promise.all(
        processedTexts.map(async (text) => {
          try {
            const result = await this.localModel(text, {
              pooling: 'mean',
              normalize: true,
            });

            let embedding: number[];
            if (result && result.data) {
              embedding = Array.from(result.data);
            } else if (Array.isArray(result)) {
              embedding = result;
            } else {
              throw new Error('Invalid embedding format');
            }

            return embedding;
          } catch (error) {
            this.logger.warn(`Failed to generate embedding for text: ${error.message}`);
            return null;
          }
        })
      );

      return results.filter((e) => e !== null) as number[][];
    } catch (error) {
      this.logger.error(`Failed to generate batch embeddings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Preprocess text before generating embedding
   */
  private preprocessText(text: string, maxLength: number = 5000): string {
    if (!text) return '';

    // Strip HTML tags
    let processed = text.replace(/<[^>]*>/g, ' ');

    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();

    // Truncate if too long
    if (processed.length > maxLength) {
      processed = processed.substring(0, maxLength);
    }

    return processed;
  }

  /**
   * Check if embedding service is available
   */
  isAvailable(): boolean {
    if (this.provider === EmbeddingProvider.GEMINI) {
      return this.geminiModel !== null && !this.isQuotaExceeded();
    } else {
      return this.localModel !== null;
    }
  }

  /**
   * Check if quota is exceeded (Gemini only)
   */
  private isQuotaExceeded(): boolean {
    if (!this.quotaExceeded) {
      return false;
    }

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
   * Handle quota exceeded error (Gemini only)
   */
  private handleQuotaError(): void {
    if (!this.quotaExceeded) {
      this.quotaExceeded = true;
      this.quotaExceededUntil = Date.now() + this.quotaCooldownMs;

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

  /**
   * Get current provider
   */
  getProvider(): EmbeddingProvider {
    return this.provider;
  }
}

