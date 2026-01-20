import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Email } from '../../entities/email.entity';
import { EmailVector } from '../../entities/email-vector.entity';

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
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailVector)
    private readonly emailVectorRepository: Repository<EmailVector>,
  ) {}

  // Note: SemanticSearchService is injected separately to avoid circular dependency
  private semanticSearchService: any = null;

  setSemanticSearchService(service: any): void {
    this.semanticSearchService = service;
  }

  /**
   * Index a single email for search
   */
  async indexEmail(userId: number, doc: EmailSearchDocument): Promise<void> {
    try {
      // Find existing email or create new one
      let email = await this.emailRepository.findOne({
        where: { userId, gmailId: doc.id },
      });

      if (!email) {
        email = this.emailRepository.create({
          userId,
          gmailId: doc.id,
        });
      }

      // Update search-related fields
      email.subject = doc.subject;
      email.senderName = doc.senderName;
      email.senderEmail = doc.senderEmail;
      email.snippet = doc.snippet || null;
      email.receivedAt = doc.receivedAt ? new Date(doc.receivedAt) : null;
      email.bodyText = doc.bodyText || null;

      await this.emailRepository.save(email);
      this.logger.log(`Indexed email ${doc.id} for user ${userId}`);

      // Check if embedding exists for this email
      const hasEmbedding = await this.emailVectorRepository.findOne({
        where: { emailId: email.id },
        select: ['id'],
      });

      // Generate embedding asynchronously if needed
      if (
        false && // DISABLED: Skip individual embedding generation to avoid rate limits
        this.semanticSearchService &&
        doc.bodyText &&
        !hasEmbedding
      ) {
        if (this.semanticSearchService.isEmbeddingServiceAvailable?.()) {
          setTimeout(() => {
            this.semanticSearchService
              .generateAndStoreEmbedding(
                userId,
                doc.id,
                doc.subject,
                doc.bodyText,
              )
              .catch((err: Error) => {
                if (!err.message.includes('quota') && !err.message.includes('Quota')) {
                  this.logger.warn(
                    `Failed to generate embedding for email ${doc.id}: ${err.message}`,
                  );
                }
              });
          }, Math.random() * 5000);
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
      const emails = await Promise.all(
        docs.map(async (doc) => {
          let email = await this.emailRepository.findOne({
            where: { userId, gmailId: doc.id },
          });

          if (!email) {
            email = this.emailRepository.create({
              userId,
              gmailId: doc.id,
            });
          }

          email.subject = doc.subject;
          email.senderName = doc.senderName;
          email.senderEmail = doc.senderEmail;
          email.snippet = doc.snippet || null;
          email.receivedAt = doc.receivedAt ? new Date(doc.receivedAt) : null;
          email.bodyText = doc.bodyText || null;

          return email;
        }),
      );

      await this.emailRepository.save(emails);
      this.logger.log(`Bulk indexed ${docs.length} emails for user ${userId}`);

      // Generate embeddings asynchronously
      if (this.semanticSearchService && this.semanticSearchService.isEmbeddingServiceAvailable?.()) {
        // Get email IDs that were just saved
        const savedEmails = await this.emailRepository.find({
          where: emails.map((e) => ({ userId, gmailId: e.gmailId })),
          select: ['id', 'gmailId'],
        });

        const emailIdMap = new Map(savedEmails.map((e) => [e.gmailId, e.id]));

        // Check which emails already have embeddings
        const emailIds = savedEmails.map((e) => e.id);
        const existingVectors = await this.emailVectorRepository.find({
          where: emailIds.map((id) => ({ emailId: id })),
          select: ['emailId'],
        });

        const existingEmbeddingIds = new Set(existingVectors.map((v) => v.emailId));

        // Filter emails that need embeddings
        const emailsNeedingEmbeddings = docs
          .filter((doc) => {
            const emailId = emailIdMap.get(doc.id);
            return doc.bodyText && emailId && !existingEmbeddingIds.has(emailId);
          });

        if (emailsNeedingEmbeddings.length === 0) {
          return;
        }

        this.logger.log(
          `Generating embeddings for ${emailsNeedingEmbeddings.length} out of ${docs.length} emails`,
        );

        const delayBetweenEmails = 0;

        // Process in background
        (async () => {
          for (let i = 0; i < emailsNeedingEmbeddings.length; i++) {
            const doc = emailsNeedingEmbeddings[i];

            try {
              if (!this.semanticSearchService.isEmbeddingServiceAvailable?.()) {
                this.logger.warn(
                  `Embedding service unavailable, stopping batch generation. Processed ${i}/${emailsNeedingEmbeddings.length} emails.`,
                );
                break;
              }

              await this.semanticSearchService.generateAndStoreEmbedding(
                userId,
                doc.id,
                doc.subject,
                doc.bodyText!,
              );

              if ((i + 1) % 10 === 0) {
                this.logger.log(
                  `Generated embeddings for ${i + 1}/${emailsNeedingEmbeddings.length} emails`,
                );
              }
            } catch (err: any) {
              const errorMessage = err?.message || String(err);

              if (
                errorMessage.includes('quota') ||
                errorMessage.includes('Quota') ||
                errorMessage.includes('429') ||
                errorMessage.includes('temporarily disabled')
              ) {
                this.logger.warn(
                  `Quota exceeded during batch generation. Processed ${i}/${emailsNeedingEmbeddings.length} emails.`,
                );
                break;
              }

              this.logger.warn(
                `Failed to generate embedding for email ${doc.id}: ${errorMessage}`,
              );
            }

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
          'Skipping embedding generation: embedding service unavailable',
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
      let queryBuilder = this.emailRepository
        .createQueryBuilder('email')
        .leftJoinAndSelect('email.kanbanColumn', 'kanbanColumn')
        .where('email.userId = :userId', { userId })
        .andWhere(
          '(email.subject IS NOT NULL OR email.senderName IS NOT NULL OR email.senderEmail IS NOT NULL)',
        );

      // Apply filters
      if (filters?.unreadOnly) {
        queryBuilder = queryBuilder.andWhere("kanbanColumn.name = 'Inbox'");
      }

      if (filters?.sender) {
        queryBuilder = queryBuilder.andWhere(
          '(email.senderName ILIKE :sender OR email.senderEmail ILIKE :sender)',
          { sender: `%${filters.sender}%` },
        );
      }

      if (filters?.status) {
        queryBuilder = queryBuilder.andWhere('kanbanColumn.name = :status', {
          status: filters.status,
        });
      }

      // Fuzzy search implementation
      if (query && query.trim()) {
        const searchTerm = query.trim();

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
        id: email.gmailId,
        subject: email.subject || '',
        senderName: email.senderName || '',
        senderEmail: email.senderEmail || '',
        snippet: email.snippet || '',
        receivedAt: email.receivedAt?.toISOString(),
        status: email.kanbanColumn?.name || 'Inbox',
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

      return {
        total: 0,
        items: [],
      };
    }
  }

  /**
   * Delete indexed email
   */
  async deleteEmail(userId: number, gmailId: string): Promise<void> {
    try {
      await this.emailRepository.delete({ userId, gmailId });
      this.logger.log(`Deleted email ${gmailId} from index for user ${userId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete email ${gmailId}: ${errorMessage}`);
    }
  }
}
