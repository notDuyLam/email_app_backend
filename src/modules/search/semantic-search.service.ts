import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EmailStatus } from '../../entities/email-status.entity';
import { EmbeddingService } from './embedding.service';
import {
  SearchResult,
  SearchFilters,
  EmailSearchDocument,
} from './search.service';

@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  constructor(
    @InjectRepository(EmailStatus)
    private readonly emailStatusRepository: Repository<EmailStatus>,
    private readonly embeddingService: EmbeddingService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Perform semantic search using vector similarity
   * @param userId - User ID to search emails for
   * @param query - Search query text
   * @param page - Page number (default: 1)
   * @param limit - Number of results per page (default: 20)
   * @param filters - Optional filters
   * @returns Search results with semantic relevance scores
   */
  async searchSemantic(
    userId: number,
    query: string,
    page = 1,
    limit = 20,
    filters?: SearchFilters,
  ): Promise<SearchResult> {
    try {
      if (!this.embeddingService.isAvailable()) {
        this.logger.debug(
          'Embedding service not available (no API key or quota exceeded). ' +
          'Semantic search disabled. Frontend will automatically fallback to fuzzy search.',
        );
        return { total: 0, items: [] };
      }

      if (!query || !query.trim()) {
        return { total: 0, items: [] };
      }

      const offset = (page - 1) * limit;
      const searchTerm = query.trim();

      this.logger.log(
        `[SEMANTIC_SEARCH] User ${userId} searching for: "${searchTerm}" (page: ${page}, limit: ${limit})`,
      );

      // Check how many emails have embeddings for this user using raw SQL
      // Note: embedding is stored as text in TypeORM but as vector in PostgreSQL
      const embeddingCountResult = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM email_statuses WHERE "userId" = $1 AND embedding IS NOT NULL`,
        [userId],
      );
      const emailsWithEmbeddings = parseInt(embeddingCountResult[0]?.count || '0', 10);
      
      this.logger.log(
        `[SEMANTIC_SEARCH] User ${userId} has ${emailsWithEmbeddings} emails with embeddings`,
      );

      if (emailsWithEmbeddings === 0) {
        this.logger.warn(
          `[SEMANTIC_SEARCH] No emails with embeddings found for user ${userId}. Semantic search will return empty results. ` +
          `This usually means embeddings haven't been generated yet (possibly due to quota limits or emails not being indexed).`,
        );
        return { total: 0, items: [] };
      }

      // Generate embedding for the search query
      const queryEmbedding = await this.embeddingService.generateEmbedding(
        searchTerm,
      );

      // Pad embedding to 768 dimensions if needed (for local model with 384 dims)
      // PostgreSQL vector column is fixed at 768 dimensions
      const paddedEmbedding = this.padEmbedding(queryEmbedding, 768);

      // Convert embedding array to PostgreSQL vector format
      const embeddingString = `[${paddedEmbedding.join(',')}]`;

      // Build base query with vector similarity search
      let queryBuilder = this.emailStatusRepository
        .createQueryBuilder('email')
        .where('email.userId = :userId', { userId })
        .andWhere('email.embedding IS NOT NULL')
        .andWhere(
          '(email.subject IS NOT NULL OR email.senderName IS NOT NULL OR email.senderEmail IS NOT NULL)',
        );

      // Apply filters
      if (filters?.unreadOnly) {
        queryBuilder = queryBuilder.andWhere("email.status = 'inbox'");
      }

      if (filters?.sender) {
        queryBuilder = queryBuilder.andWhere(
          '(email.senderName ILIKE :sender OR email.senderEmail ILIKE :sender)',
          { sender: `%${filters.sender}%` },
        );
      }

      if (filters?.status) {
        queryBuilder = queryBuilder.andWhere('email.status = :status', {
          status: filters.status,
        });
      }

      // Use raw SQL for vector similarity search
      // pgvector uses <=> operator for cosine distance
      // 1 - (embedding <=> query_embedding) gives cosine similarity
      // Build WHERE conditions and parameters
      const whereConditions: string[] = [
        'email."userId" = $1',
        'email.embedding IS NOT NULL',
      ];
      const queryParams: any[] = [userId];

      // Add embedding as $2
      queryParams.push(embeddingString);

      if (filters?.unreadOnly) {
        whereConditions.push("email.status = 'inbox'");
      }

      if (filters?.sender) {
        const paramIndex = queryParams.length + 1;
        whereConditions.push(
          `(email.sender_name ILIKE $${paramIndex} OR email.sender_email ILIKE $${paramIndex})`,
        );
        queryParams.push(`%${filters.sender}%`);
      }

      if (filters?.status) {
        const paramIndex = queryParams.length + 1;
        whereConditions.push(`email.status = $${paramIndex}`);
        queryParams.push(filters.status);
      }

      const whereClause = whereConditions.join(' AND ');

      // Add limit and offset parameters
      const limitParam = queryParams.length + 1;
      const offsetParam = queryParams.length + 2;
      queryParams.push(limit, offset);

      const vectorQuery = `
        SELECT 
          email.*,
          1 - (email.embedding::vector <=> $2::vector) as similarity_score
        FROM email_statuses email
        WHERE ${whereClause}
        ORDER BY email.embedding::vector <=> $2::vector
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      // Execute raw query with parameters
      this.logger.debug(
        `[SEMANTIC_SEARCH] Executing vector query with ${queryParams.length} parameters`,
      );
      this.logger.debug(
        `[SEMANTIC_SEARCH] Query preview: ${vectorQuery.substring(0, 200)}...`,
      );
      const results = await this.dataSource.query(vectorQuery, queryParams);
      this.logger.debug(
        `[SEMANTIC_SEARCH] Vector query returned ${results.length} results`,
      );

      // Get total count (same WHERE conditions but no limit/offset)
      const countParams: any[] = [userId];
      const countWhereConditions: string[] = [
        'email."userId" = $1',
        'email.embedding IS NOT NULL',
      ];

      if (filters?.unreadOnly) {
        countWhereConditions.push("email.status = 'inbox'");
      }

      if (filters?.sender) {
        const paramIndex = countParams.length + 1;
        countWhereConditions.push(
          `(email.sender_name ILIKE $${paramIndex} OR email.sender_email ILIKE $${paramIndex})`,
        );
        countParams.push(`%${filters.sender}%`);
      }

      if (filters?.status) {
        const paramIndex = countParams.length + 1;
        countWhereConditions.push(`email.status = $${paramIndex}`);
        countParams.push(filters.status);
      }

      const countWhereClause = countWhereConditions.join(' AND ');
      const countQuery = `
        SELECT COUNT(*) as total
        FROM email_statuses email
        WHERE ${countWhereClause}
      `;

      const countResult = await this.dataSource.query(countQuery, countParams);

      const total = parseInt(countResult[0]?.total || '0', 10);

      // Map results to EmailSearchDocument format
      const items: Array<EmailSearchDocument & { score?: number }> =
        results.map((row: any) => ({
          id: row.emailId || row.email_id,
          subject: row.subject || '',
          senderName: row.sender_name || row.senderName || '',
          senderEmail: row.sender_email || row.senderEmail || '',
          snippet: row.snippet || '',
          receivedAt: row.received_at
            ? new Date(row.received_at).toISOString()
            : undefined,
          status: row.status,
          score: parseFloat(row.similarity_score || '0'),
        }));

      this.logger.log(
        `[SEMANTIC_SEARCH] Found ${total} results for user ${userId}, returning ${items.length} items`,
      );

      return {
        total,
        items,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to perform semantic search: ${errorMessage}`);

      // Return empty results instead of throwing to prevent app crash
      return {
        total: 0,
        items: [],
      };
    }
  }

  /**
   * Generate and store embedding for an email
   * @param userId - User ID
   * @param emailId - Email ID
   * @param subject - Email subject
   * @param bodyText - Email body text (truncated)
   */
  async generateAndStoreEmbedding(
    userId: number,
    emailId: string,
    subject: string,
    bodyText: string,
  ): Promise<void> {
    try {
      if (!this.embeddingService.isAvailable()) {
        this.logger.warn(
          'Embedding service not available, skipping embedding generation',
        );
        return;
      }

      // Find existing email status
      let emailStatus = await this.emailStatusRepository.findOne({
        where: { userId, emailId },
      });

      if (!emailStatus) {
        this.logger.warn(
          `Email status not found for emailId ${emailId}, userId ${userId}`,
        );
        return;
      }

      // Combine subject and body for embedding
      const textForEmbedding = `${subject || ''} ${bodyText || ''}`.trim();

      if (!textForEmbedding) {
        this.logger.warn(
          `No text content for embedding (emailId: ${emailId})`,
        );
        return;
      }

      // Generate embedding
      const embedding = await this.embeddingService.generateEmbedding(
        textForEmbedding,
      );

      // Pad embedding to 768 dimensions if needed (for local model with 384 dims)
      // PostgreSQL vector column is fixed at 768 dimensions
      const paddedEmbedding = this.padEmbedding(embedding, 768);

      // Convert embedding to PostgreSQL vector format
      const embeddingString = `[${paddedEmbedding.join(',')}]`;

      // Update email status with embedding
      // Use raw query to update vector column since TypeORM doesn't support it natively
      await this.dataSource.query(
        `
        UPDATE email_statuses
        SET embedding = $1::vector,
            embedding_updated_at = NOW()
        WHERE "userId" = $2 AND "emailId" = $3
      `,
        [embeddingString, userId, emailId],
      );

      this.logger.log(
        `Generated and stored embedding for email ${emailId} (userId: ${userId})`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      
      // Handle quota errors gracefully - don't spam logs
      if (
        errorMessage.includes('429') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('Quota exceeded') ||
        errorMessage.includes('temporarily disabled')
      ) {
        // Quota errors are already logged by EmbeddingService
        // Just return silently to avoid log spam
        return;
      }
      
      // For other errors, log a warning (not error) since this is background processing
      this.logger.warn(
        `Failed to generate embedding for email ${emailId}: ${errorMessage}`,
      );
      // Don't throw - allow email indexing to continue even if embedding fails
    }
  }

  /**
   * Check if embedding service is available
   */
  isEmbeddingServiceAvailable(): boolean {
    return this.embeddingService.isAvailable();
  }

  /**
   * Pad embedding vector to target dimensions
   * Used when local model (384 dims) needs to match PostgreSQL column (768 dims)
   * Padding with zeros is safe for cosine similarity
   */
  private padEmbedding(embedding: number[], targetDimensions: number): number[] {
    if (embedding.length === targetDimensions) {
      return embedding;
    }

    if (embedding.length > targetDimensions) {
      // Truncate if somehow larger (shouldn't happen)
      this.logger.warn(
        `Embedding dimension ${embedding.length} is larger than target ${targetDimensions}, truncating`,
      );
      return embedding.slice(0, targetDimensions);
    }

    // Pad with zeros
    const padding = new Array(targetDimensions - embedding.length).fill(0);
    return [...embedding, ...padding];
  }
}

