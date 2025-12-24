import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailStatus } from '../../entities/email-status.entity';

export interface EmailSearchDocument {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet?: string;
  receivedAt?: string;
  status?: string;
  bodyText?: string; // Truncated body text for embedding generation
}

export interface SearchResult {
  total: number;
  items: Array<EmailSearchDocument & { score?: number }>;
}

export interface SearchFilters {
  unreadOnly?: boolean;
  hasAttachment?: boolean;
  sender?: string;
  status?: string;
}

export enum SortOption {
  DATE_DESC = 'date_desc',
  DATE_ASC = 'date_asc',
  RELEVANCE = 'relevance',
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(EmailStatus)
    private readonly emailStatusRepository: Repository<EmailStatus>,
  ) {}

  // Note: SemanticSearchService is injected separately to avoid circular dependency
  // This will be set via setter injection or module configuration
  private semanticSearchService: any = null;

  setSemanticSearchService(service: any): void {
    this.semanticSearchService = service;
  }

  /**
   * Index a single email for search
   */
  async indexEmail(userId: number, doc: EmailSearchDocument): Promise<void> {
    try {
      // Find existing email status or create new one
      let emailStatus = await this.emailStatusRepository.findOne({
        where: { userId, emailId: doc.id },
      });

      if (!emailStatus) {
        emailStatus = this.emailStatusRepository.create({
          userId,
          emailId: doc.id,
        });
      }

      // Update search-related fields
      emailStatus.subject = doc.subject;
      emailStatus.senderName = doc.senderName;
      emailStatus.senderEmail = doc.senderEmail;
      emailStatus.snippet = doc.snippet || null;
      emailStatus.receivedAt = doc.receivedAt ? new Date(doc.receivedAt) : null;
      emailStatus.bodyText = doc.bodyText || null; // Store truncated body text
      if (doc.status) {
        emailStatus.status = doc.status as any;
      }

      await this.emailStatusRepository.save(emailStatus);
      this.logger.log(`Indexed email ${doc.id} for user ${userId}`);

      // Generate embedding asynchronously (don't block indexing)
      // Only generate if:
      // 1. Semantic search service is available
      // 2. Email doesn't already have an embedding
      // 3. Body text exists
      // NOTE: We skip embedding generation during bulk indexing to avoid rate limits
      // Embeddings will be generated later via bulkIndexEmails with proper rate limiting
      // This prevents hundreds of concurrent requests when loading dashboard
      if (
        false && // DISABLED: Skip individual embedding generation to avoid rate limits
        this.semanticSearchService &&
        doc.bodyText &&
        !emailStatus.embedding // Skip if embedding already exists
      ) {
        // Check if embedding service is available (not quota exceeded)
        if (this.semanticSearchService.isEmbeddingServiceAvailable?.()) {
          // Add delay before generating to avoid rate limits
          setTimeout(() => {
            this.semanticSearchService
              .generateAndStoreEmbedding(
                userId,
                doc.id,
                doc.subject,
                doc.bodyText,
              )
              .catch((err: Error) => {
                // Only log if it's not a quota error (those are handled by embedding service)
                if (!err.message.includes('quota') && !err.message.includes('Quota')) {
                  this.logger.warn(
                    `Failed to generate embedding for email ${doc.id}: ${err.message}`,
                  );
                }
              });
          }, Math.random() * 5000); // Random delay 0-5 seconds to spread out requests
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to index email ${doc.id}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Bulk index multiple emails
   */
  async bulkIndexEmails(
    userId: number,
    docs: EmailSearchDocument[],
  ): Promise<void> {
    if (!docs.length) return;

    try {
      const emailStatuses = await Promise.all(
        docs.map(async (doc) => {
          let emailStatus = await this.emailStatusRepository.findOne({
            where: { userId, emailId: doc.id },
          });

          if (!emailStatus) {
            emailStatus = this.emailStatusRepository.create({
              userId,
              emailId: doc.id,
            });
          }

          emailStatus.subject = doc.subject;
          emailStatus.senderName = doc.senderName;
          emailStatus.senderEmail = doc.senderEmail;
          emailStatus.snippet = doc.snippet || null;
          emailStatus.receivedAt = doc.receivedAt
            ? new Date(doc.receivedAt)
            : null;
          emailStatus.bodyText = doc.bodyText || null; // Store truncated body text
          if (doc.status) {
            emailStatus.status = doc.status as any;
          }

          return emailStatus;
        }),
      );

      await this.emailStatusRepository.save(emailStatuses);
      this.logger.log(`Bulk indexed ${docs.length} emails for user ${userId}`);

      // Generate embeddings asynchronously for all emails (don't block indexing)
      // Only generate for emails without embeddings and when service is available
      if (this.semanticSearchService && this.semanticSearchService.isEmbeddingServiceAvailable?.()) {
        // Filter emails that need embeddings (have bodyText but no embedding)
        const emailsNeedingEmbeddings = emailStatuses
          .map((status, index) => ({ status, doc: docs[index] }))
          .filter(
            ({ status, doc }) =>
              doc.bodyText && !status.embedding, // Only generate if bodyText exists and no embedding yet
          );

        if (emailsNeedingEmbeddings.length === 0) {
          return; // All emails already have embeddings
        }

        this.logger.log(
          `Generating embeddings for ${emailsNeedingEmbeddings.length} out of ${docs.length} emails`,
        );

        // Process embeddings one by one in background.
        // NOTE: Previously we added a 2s delay between emails to avoid external API rate limits.
        // Now we are using a local embedding model by default, so we can safely remove that delay
        // and generate embeddings continuously for better indexing performance.
        const delayBetweenEmails = 0;

        // Process in background (don't await)
        (async () => {
          for (let i = 0; i < emailsNeedingEmbeddings.length; i++) {
            const { status, doc } = emailsNeedingEmbeddings[i];
            
            try {
              // Check if service is still available before each request
              if (!this.semanticSearchService.isEmbeddingServiceAvailable?.()) {
                this.logger.warn(
                  `Embedding service unavailable (quota exceeded), stopping batch generation. Processed ${i}/${emailsNeedingEmbeddings.length} emails.`,
                );
                break; // Stop if quota exceeded
              }
              
              await this.semanticSearchService.generateAndStoreEmbedding(
                userId,
                doc.id,
                doc.subject,
                doc.bodyText!,
              );
              
              // Log progress every 10 emails
              if ((i + 1) % 10 === 0) {
                this.logger.log(
                  `Generated embeddings for ${i + 1}/${emailsNeedingEmbeddings.length} emails`,
                );
              }
            } catch (err: any) {
              const errorMessage = err?.message || String(err);
              
              // If quota exceeded, stop processing
              if (
                errorMessage.includes('quota') ||
                errorMessage.includes('Quota') ||
                errorMessage.includes('429') ||
                errorMessage.includes('temporarily disabled')
              ) {
                this.logger.warn(
                  `Quota exceeded during batch generation. Processed ${i}/${emailsNeedingEmbeddings.length} emails. Remaining will be processed later.`,
                );
                break; // Stop processing
              }
              
              // For other errors, log and continue
              this.logger.warn(
                `Failed to generate embedding for email ${doc.id}: ${errorMessage}`,
              );
            }
            
            // Add delay between each email (except for the last one)
            if (i < emailsNeedingEmbeddings.length - 1 && delayBetweenEmails > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayBetweenEmails));
            }
          }
          
          this.logger.log(
            `Completed embedding generation batch for user ${userId}`,
          );
        })().catch((err) => {
          this.logger.error(
            `Error in bulk embedding generation: ${err.message}`,
          );
        });
      } else if (this.semanticSearchService && !this.semanticSearchService.isEmbeddingServiceAvailable?.()) {
        this.logger.debug(
          'Skipping embedding generation: embedding service unavailable (quota exceeded or not configured)',
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to bulk index emails: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Fuzzy search emails using PostgreSQL Full-Text Search + Trigram similarity
   * Supports:
   * - Typo tolerance (via pg_trgm)
   * - Partial matches
   * - Full-text search
   * - Ranking by relevance
   */
  async searchEmails(
    userId: number,
    query: string,
    page = 1,
    limit = 20,
    filters?: SearchFilters,
    sort: SortOption = SortOption.RELEVANCE,
  ): Promise<SearchResult> {
    try {
      const offset = (page - 1) * limit;

      this.logger.log(
        `[SEARCH] User ${userId} searching for: "${query}" (page: ${page}, limit: ${limit})`,
      );

      // Build the base query
      let queryBuilder = this.emailStatusRepository
        .createQueryBuilder('email')
        .where('email.userId = :userId', { userId })
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

      // Fuzzy search implementation
      if (query && query.trim()) {
        const searchTerm = query.trim();

        // Use trigram similarity for fuzzy matching + ILIKE for partial match
        // Lower threshold (0.05) for better recall, prioritize ILIKE for exact partial matches
        queryBuilder = queryBuilder.andWhere(
          `(
            similarity(LOWER(email.subject), LOWER(:searchTerm)) > 0.05 OR
            similarity(LOWER(email.senderName), LOWER(:searchTerm)) > 0.05 OR
            similarity(LOWER(email.senderEmail), LOWER(:searchTerm)) > 0.05 OR
            LOWER(email.subject) LIKE LOWER(:likeSearch) OR
            LOWER(email.senderName) LIKE LOWER(:likeSearch) OR
            LOWER(email.senderEmail) LIKE LOWER(:likeSearch) OR
            LOWER(email.snippet) LIKE LOWER(:likeSearch)
          )`,
          {
            searchTerm,
            likeSearch: `%${searchTerm}%`,
          },
        );

        // Add relevance score for ranking (prioritize exact matches)
        queryBuilder = queryBuilder.addSelect(
          `
          (
            GREATEST(
              CASE WHEN LOWER(email.subject) LIKE LOWER(:likeSearch) THEN 3.0 ELSE 0 END,
              CASE WHEN LOWER(email.senderName) LIKE LOWER(:likeSearch) THEN 2.5 ELSE 0 END,
              CASE WHEN LOWER(email.senderEmail) LIKE LOWER(:likeSearch) THEN 2.5 ELSE 0 END,
              CASE WHEN LOWER(email.snippet) LIKE LOWER(:likeSearch) THEN 1.5 ELSE 0 END,
              similarity(LOWER(email.subject), LOWER(:searchTerm)) * 2.0,
              similarity(LOWER(email.senderName), LOWER(:searchTerm)) * 1.5,
              similarity(LOWER(email.senderEmail), LOWER(:searchTerm)) * 1.5
            )
          )
          `,
          'relevance_score',
        );
      } else {
        // If no search query, just add a default score
        queryBuilder = queryBuilder.addSelect('1', 'relevance_score');
      }

      // Apply sorting
      if (sort === SortOption.RELEVANCE && query && query.trim()) {
        queryBuilder = queryBuilder.orderBy('relevance_score', 'DESC');
        queryBuilder = queryBuilder.addOrderBy('email.receivedAt', 'DESC');
      } else if (sort === SortOption.DATE_DESC) {
        queryBuilder = queryBuilder.orderBy('email.receivedAt', 'DESC');
      } else if (sort === SortOption.DATE_ASC) {
        queryBuilder = queryBuilder.orderBy('email.receivedAt', 'ASC');
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Get paginated results
      const results = await queryBuilder
        .offset(offset)
        .limit(limit)
        .getRawAndEntities();

      const items = results.entities.map((email, index) => ({
        id: email.emailId,
        subject: email.subject || '',
        senderName: email.senderName || '',
        senderEmail: email.senderEmail || '',
        snippet: email.snippet || '',
        receivedAt: email.receivedAt?.toISOString(),
        status: email.status,
        score: results.raw[index]?.relevance_score || 0,
      }));

      this.logger.log(
        `[SEARCH] Found ${total} results for user ${userId}, returning ${items.length} items`,
      );

      return {
        total,
        items,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to search emails: ${errorMessage}`);

      // Return empty results instead of throwing to prevent app crash
      return {
        total: 0,
        items: [],
      };
    }
  }

  /**
   * Delete indexed email
   */
  async deleteEmail(userId: number, emailId: string): Promise<void> {
    try {
      await this.emailStatusRepository.delete({ userId, emailId });
      this.logger.log(`Deleted email ${emailId} from index for user ${userId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete email ${emailId}: ${errorMessage}`);
    }
  }
}
