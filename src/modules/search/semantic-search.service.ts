import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Email } from '../../entities/email.entity';
import { EmailVector } from '../../entities/email-vector.entity';
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
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailVector)
    private readonly emailVectorRepository: Repository<EmailVector>,
    private readonly embeddingService: EmbeddingService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Check if pgvector extension is available
   */
  private async isPgvectorAvailable(): Promise<boolean> {
    try {
      const result = await this.dataSource.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'vector'`,
      );
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Perform semantic search using vector similarity
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
          'Embedding service not available. Semantic search disabled.',
        );
        return { total: 0, items: [] };
      }

      const hasPgvector = await this.isPgvectorAvailable();
      if (!hasPgvector) {
        this.logger.debug(
          'pgvector extension not available. Semantic search disabled.',
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

      const embeddingCountResult = await this.dataSource.query(
        `
        SELECT COUNT(*) as count 
        FROM email_vectors ev
        JOIN emails e ON ev."emailId" = e.id
        WHERE e."userId" = $1 AND ev.embedding IS NOT NULL
        `,
        [userId],
      );
      const emailsWithEmbeddings = parseInt(
        embeddingCountResult[0]?.count || '0',
        10,
      );

      this.logger.log(
        `[SEMANTIC_SEARCH] User ${userId} has ${emailsWithEmbeddings} emails with embeddings`,
      );

      if (emailsWithEmbeddings === 0) {
        this.logger.warn(
          `[SEMANTIC_SEARCH] No emails with embeddings found for user ${userId}.`,
        );
        return { total: 0, items: [] };
      }

      const queryEmbedding =
        await this.embeddingService.generateEmbedding(searchTerm);

      const paddedEmbedding = this.padEmbedding(queryEmbedding, 768);
      const embeddingString = `[${paddedEmbedding.join(',')}]`;

      const whereConditions: string[] = [
        'e."userId" = $1',
        'ev.embedding IS NOT NULL',
      ];
      const queryParams: any[] = [userId, embeddingString];

      if (filters?.unreadOnly) {
        whereConditions.push("kc.name = 'Inbox'");
      }

      if (filters?.sender) {
        const paramIndex = queryParams.length + 1;
        whereConditions.push(
          `(e.sender_name ILIKE $${paramIndex} OR e.sender_email ILIKE $${paramIndex})`,
        );
        queryParams.push(`%${filters.sender}%`);
      }

      if (filters?.status) {
        const paramIndex = queryParams.length + 1;
        whereConditions.push(`kc.name = $${paramIndex}`);
        queryParams.push(filters.status);
      }

      const whereClause = whereConditions.join(' AND ');

      const limitParam = queryParams.length + 1;
      const offsetParam = queryParams.length + 2;
      queryParams.push(limit, offset);

      const vectorQuery = `
        SELECT 
          e.id,
          e."gmailId",
          e.subject,
          e.sender_name,
          e.sender_email,
          e.snippet,
          e.received_at,
          kc.name as status,
          1 - (ev.embedding::vector <=> $2::vector) as similarity_score
        FROM emails e
        JOIN email_vectors ev ON ev."emailId" = e.id
        LEFT JOIN kanban_columns kc ON e."kanbanColumnId" = kc.id
        WHERE ${whereClause}
        ORDER BY ev.embedding::vector <=> $2::vector
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      this.logger.debug(
        `[SEMANTIC_SEARCH] Executing vector query with ${queryParams.length} parameters`,
      );

      const results = await this.dataSource.query(vectorQuery, queryParams);

      const countParams: any[] = [userId];
      const countWhereConditions: string[] = [
        'e."userId" = $1',
        'ev.embedding IS NOT NULL',
      ];

      if (filters?.unreadOnly) {
        countWhereConditions.push("kc.name = 'Inbox'");
      }

      if (filters?.sender) {
        const paramIndex = countParams.length + 1;
        countWhereConditions.push(
          `(e.sender_name ILIKE $${paramIndex} OR e.sender_email ILIKE $${paramIndex})`,
        );
        countParams.push(`%${filters.sender}%`);
      }

      if (filters?.status) {
        const paramIndex = countParams.length + 1;
        countWhereConditions.push(`kc.name = $${paramIndex}`);
        countParams.push(filters.status);
      }

      const countWhereClause = countWhereConditions.join(' AND ');
      const countQuery = `
        SELECT COUNT(*) as total
        FROM emails e
        JOIN email_vectors ev ON ev."emailId" = e.id
        LEFT JOIN kanban_columns kc ON e."kanbanColumnId" = kc.id
        WHERE ${countWhereClause}
      `;

      const countResult = await this.dataSource.query(countQuery, countParams);
      const total = parseInt(countResult[0]?.total || '0', 10);

      const items: Array<EmailSearchDocument & { score?: number }> =
        results.map((row: any) => ({
          id: row.gmailId,
          subject: row.subject || '',
          senderName: row.sender_name || '',
          senderEmail: row.sender_email || '',
          snippet: row.snippet || '',
          receivedAt: row.received_at
            ? new Date(row.received_at).toISOString()
            : undefined,
          status: row.status || 'Inbox',
          score: parseFloat(row.similarity_score || '0'),
        }));

      this.logger.log(
        `[SEMANTIC_SEARCH] Found ${total} results for user ${userId}, returning ${items.length} items`,
      );

      return { total, items };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to perform semantic search: ${errorMessage}`);
      return { total: 0, items: [] };
    }
  }

  /**
   * Generate and store embedding for an email
   */
  async generateAndStoreEmbedding(
    userId: number,
    gmailId: string,
    subject: string,
    bodyText: string,
  ): Promise<void> {
    try {
      if (!this.embeddingService.isAvailable()) {
        this.logger.warn('Embedding service not available, skipping');
        return;
      }

      const hasPgvector = await this.isPgvectorAvailable();
      if (!hasPgvector) {
        this.logger.debug('pgvector not available, skipping embedding storage');
        return;
      }

      const email = await this.emailRepository.findOne({
        where: { userId, gmailId },
      });

      if (!email) {
        this.logger.warn(
          `Email not found for gmailId ${gmailId}, userId ${userId}`,
        );
        return;
      }

      const textForEmbedding = `${subject || ''} ${bodyText || ''}`.trim();

      if (!textForEmbedding) {
        this.logger.warn(`No text content for embedding (gmailId: ${gmailId})`);
        return;
      }

      const embedding =
        await this.embeddingService.generateEmbedding(textForEmbedding);

      const paddedEmbedding = this.padEmbedding(embedding, 768);
      const embeddingString = `[${paddedEmbedding.join(',')}]`;

      const existingVector = await this.emailVectorRepository.findOne({
        where: { emailId: email.id },
      });

      if (existingVector) {
        await this.dataSource.query(
          `
          UPDATE email_vectors
          SET embedding = $1::vector,
              embedding_updated_at = NOW(),
              "updatedAt" = NOW()
          WHERE "emailId" = $2
          `,
          [embeddingString, email.id],
        );
      } else {
        await this.dataSource.query(
          `
          INSERT INTO email_vectors ("emailId", embedding, embedding_updated_at, "createdAt", "updatedAt")
          VALUES ($1, $2::vector, NOW(), NOW(), NOW())
          `,
          [email.id, embeddingString],
        );
      }

      this.logger.log(
        `Generated and stored embedding for email ${gmailId} (userId: ${userId})`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes('429') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('Quota exceeded') ||
        errorMessage.includes('temporarily disabled')
      ) {
        return;
      }

      this.logger.warn(
        `Failed to generate embedding for email ${gmailId}: ${errorMessage}`,
      );
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
   */
  private padEmbedding(
    embedding: number[],
    targetDimensions: number,
  ): number[] {
    if (embedding.length === targetDimensions) {
      return embedding;
    }

    if (embedding.length > targetDimensions) {
      this.logger.warn(
        `Embedding dimension ${embedding.length} is larger than target ${targetDimensions}, truncating`,
      );
      return embedding.slice(0, targetDimensions);
    }

    const padding = new Array(targetDimensions - embedding.length).fill(0);
    return [...embedding, ...padding];
  }
}
