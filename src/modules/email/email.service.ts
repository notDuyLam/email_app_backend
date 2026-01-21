import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { GmailService } from '../gmail/gmail.service';
import { Email } from '../../entities/email.entity';
import { SnoozeSchedule } from '../../entities/snooze-schedule.entity';
import { KanbanColumn } from '../../entities/kanban-column.entity';
import { MailboxDto } from './dto/mailbox.dto';
import { EmailListResponseDto, EmailListItemDto } from './dto/email-list.dto';
import { EmailDetailDto } from './dto/email-detail.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ForwardEmailDto } from './dto/forward-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';
import { EmailStatusResponseDto } from './dto/email-status-response.dto';
import {
  SearchService,
  EmailSearchDocument,
  SearchFilters,
  SortOption,
} from '../search/search.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private pendingEmbeddingJobs = new Map<number, NodeJS.Timeout>();

  constructor(
    private readonly gmailService: GmailService,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(SnoozeSchedule)
    private readonly snoozeScheduleRepository: Repository<SnoozeSchedule>,
    @InjectRepository(KanbanColumn)
    private readonly kanbanColumnRepository: Repository<KanbanColumn>,
    private readonly searchService: SearchService,
    private readonly dataSource: DataSource,
  ) {}

  private mapToSearchDocument(
    gmailId: string,
    detail: {
      subject: string;
      from: string;
      body: string;
      receivedDate: Date;
    },
    email?: Email,
  ): EmailSearchDocument {
    const bodyText = this.stripHtmlTags(detail.body || '');
    return {
      id: gmailId,
      subject: detail.subject || '',
      senderName: this.extractNameFromEmail(detail.from),
      senderEmail: detail.from,
      snippet: bodyText.substring(0, 200),
      receivedAt: detail.receivedDate?.toISOString?.(),
      status: email?.kanbanColumn?.name || 'Inbox',
    };
  }

  /**
   * Get default Inbox column for a user
   */
  private async getDefaultInboxColumn(
    userId: number,
  ): Promise<KanbanColumn | null> {
    return this.kanbanColumnRepository.findOne({
      where: { userId, name: 'Inbox', isDefault: true },
    });
  }

  /**
   * Get column by name for a user
   */
  private async getColumnByName(
    userId: number,
    name: string,
  ): Promise<KanbanColumn | null> {
    return this.kanbanColumnRepository.findOne({
      where: { userId, name },
    });
  }

  async getMailboxes(userId: number): Promise<MailboxDto[]> {
    const mailboxes = await this.gmailService.getMailboxes(userId);
    return mailboxes.map((mb) => ({
      id: mb.id,
      name: mb.name,
      unreadCount: mb.unreadCount,
    }));
  }

  async getEmailsByMailbox(
    userId: number,
    mailboxId: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    pageToken?: string,
  ): Promise<EmailListResponseDto> {
    const result = await this.gmailService.getEmails(
      userId,
      mailboxId,
      page,
      pageSize,
      pageToken,
      search,
    );

    const gmailIds = result.messages.slice(0, pageSize).map((msg) => msg.id);

    let emailMap = new Map<string, Email>();
    let snoozeMap = new Map<number, SnoozeSchedule>();

    if (gmailIds.length > 0) {
      const emails = await this.emailRepository.find({
        where: { gmailId: In(gmailIds), userId },
      });

      emailMap = new Map(emails.map((e) => [e.gmailId, e]));

      const emailIds = emails.map((e) => e.id);
      if (emailIds.length > 0) {
        const snoozes = await this.snoozeScheduleRepository.find({
          where: { emailId: In(emailIds) },
        });
        snoozeMap = new Map(snoozes.map((s) => [s.emailId, s]));
      }
    }

    const emailsForBulkIndex: Array<{
      id: string;
      detail: any;
      email?: Email;
    }> = [];

    const emailDetails = await Promise.all(
      result.messages.slice(0, pageSize).map(async (msg) => {
        try {
          const detail = await this.gmailService.getEmailDetail(userId, msg.id);
          const email = emailMap.get(msg.id);
          const snooze = email ? snoozeMap.get(email.id) : null;

          emailsForBulkIndex.push({ id: msg.id, detail, email });

          this.indexEmailForSearchAsync(userId, msg.id, detail, email).catch(
            (err) =>
              this.logger.warn(
                `Failed to auto-index email ${msg.id}: ${err.message}`,
              ),
          );

          return {
            id: detail.id,
            senderName: this.extractNameFromEmail(detail.from),
            subject: detail.subject,
            preview: this.stripHtmlTags(detail.body).substring(0, 100),
            timestamp: detail.receivedDate,
            isStarred: detail.isStarred,
            isRead: detail.isRead,
            snoozedUntil: snooze?.snoozeUntil || null,
            hasAttachments: detail.attachments && detail.attachments.length > 0,
          } as EmailListItemDto;
        } catch (error) {
          return {
            id: msg.id,
            senderName: '',
            subject: '',
            preview: '',
            timestamp: new Date(),
            isStarred: false,
            isRead: true,
            snoozedUntil: null,
          } as EmailListItemDto;
        }
      }),
    );

    if (emailsForBulkIndex.length > 0) {
      this.scheduleBulkEmbeddingGeneration(userId, emailsForBulkIndex);
    }

    return {
      emails: emailDetails,
      total: result.total,
      page,
      pageSize,
      nextPageToken: result.nextPageToken,
    };
  }

  async searchEmailsFuzzy(
    userId: number,
    query: string,
    page = 1,
    pageSize = 20,
    filters?: SearchFilters,
    sort?: SortOption,
  ): Promise<EmailListResponseDto> {
    const { total, items } = await this.searchService.searchEmails(
      userId,
      query,
      page,
      pageSize,
      filters,
      sort,
    );

    const emails: EmailListItemDto[] = items.map((item) => ({
      id: item.id,
      senderName: item.senderName,
      subject: item.subject,
      preview: item.snippet || '',
      timestamp: item.receivedAt ? new Date(item.receivedAt) : new Date(),
      isStarred: false,
      isRead: item.status !== 'Inbox',
      snoozedUntil: null,
      hasAttachments: false,
    }));

    return {
      emails,
      total,
      page,
      pageSize,
      nextPageToken: undefined,
    };
  }

  async getEmailById(userId: number, emailId: string): Promise<EmailDetailDto> {
    const detail = await this.gmailService.getEmailDetail(userId, emailId);

    return {
      id: detail.id,
      from: detail.from,
      to: detail.to,
      cc: detail.cc,
      subject: detail.subject,
      receivedDate: detail.receivedDate,
      body: detail.body,
      attachments: detail.attachments.map((att) => ({
        id: att.id,
        name: att.name,
        size: att.size,
        type: att.type,
      })),
      isStarred: detail.isStarred,
      isRead: detail.isRead,
      labelIds: detail.labelIds || [],
    };
  }

  private async indexEmailForSearchAsync(
    userId: number,
    gmailId: string,
    detail?: any,
    email?: Email,
  ): Promise<void> {
    try {
      const doc = this.mapToSearchDocument(gmailId, detail, email);
      await this.searchService.indexEmail(userId, doc);
    } catch (error) {
      this.logger.debug(
        `Auto-index failed for email ${gmailId}: ${error.message}`,
      );
    }
  }

  async indexEmailForSearch(userId: number, gmailId: string): Promise<void> {
    const [detail, email] = await Promise.all([
      this.gmailService.getEmailDetail(userId, gmailId),
      this.emailRepository.findOne({
        where: { userId, gmailId },
        relations: ['kanbanColumn'],
      }),
    ]);

    const doc = this.mapToSearchDocument(gmailId, detail, email || undefined);
    await this.searchService.indexEmail(userId, doc);
  }

  /**
   * Schedule bulk embedding generation for emails
   */
  private scheduleBulkEmbeddingGeneration(
    userId: number,
    emails: Array<{ id: string; detail: any; email?: Email }>,
  ): void {
    const existingTimeout = this.pendingEmbeddingJobs.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        const docs = emails
          .map(({ id, detail, email }) =>
            this.mapToSearchDocument(id, detail, email),
          )
          .filter((doc) => doc.bodyText);

        if (docs.length > 0) {
          await this.searchService.bulkIndexEmails(userId, docs);
        }
      } catch (error) {
        this.logger.error(
          `[AUTO_EMBEDDING] Failed to generate embeddings: ${error.message}`,
        );
      } finally {
        this.pendingEmbeddingJobs.delete(userId);
      }
    }, 5000);

    this.pendingEmbeddingJobs.set(userId, timeout);
  }

  async reindexMailboxEmails(
    userId: number,
    mailboxId: string = 'INBOX',
    maxPages = 3,
    pageSize = 50,
  ): Promise<{ indexed: number }> {
    let page = 1;
    let pageToken: string | undefined = undefined;
    let totalIndexed = 0;

    for (; page <= maxPages; page++) {
      const result = await this.gmailService.getEmails(
        userId,
        mailboxId,
        page,
        pageSize,
        pageToken,
        '',
      );

      const messages = result.messages || [];
      if (!messages.length) {
        break;
      }

      const gmailIds = messages.map((m) => m.id);

      const emails = await this.emailRepository.find({
        where: { gmailId: In(gmailIds), userId },
        relations: ['kanbanColumn'],
      });
      const emailMap = new Map<string, Email>(
        emails.map((e) => [e.gmailId, e]),
      );

      const docs: EmailSearchDocument[] = [];
      for (const msg of messages) {
        try {
          const detail = await this.gmailService.getEmailDetail(userId, msg.id);
          const email = emailMap.get(msg.id);
          const doc = this.mapToSearchDocument(msg.id, detail, email);
          docs.push(doc);
        } catch (error) {
          this.logger.error(
            `[REINDEX] Failed to fetch detail for email ${msg.id}: ${error.message}`,
          );
        }
      }

      await this.searchService.bulkIndexEmails(userId, docs);
      totalIndexed += docs.length;

      pageToken = result.nextPageToken;
      if (!pageToken) {
        break;
      }
    }

    return { indexed: totalIndexed };
  }

  async sendEmail(
    userId: number,
    sendEmailDto: SendEmailDto,
  ): Promise<{ id: string; threadId: string }> {
    const result = await this.gmailService.sendEmail(
      userId,
      sendEmailDto.to,
      sendEmailDto.subject,
      sendEmailDto.body,
      sendEmailDto.cc,
      sendEmailDto.bcc,
      sendEmailDto.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        mimeType: att.mimeType,
      })),
    );

    try {
      await this.indexEmailForSearch(userId, result.id);
    } catch (error) {
      this.logger.error(
        `Failed to index sent email ${result.id} for user ${userId}: ${error.message}`,
      );
    }

    return result;
  }

  async replyEmail(
    userId: number,
    emailId: string,
    replyDto: ReplyEmailDto,
  ): Promise<{ id: string; threadId: string }> {
    return this.gmailService.replyEmail(
      userId,
      emailId,
      replyDto.body,
      replyDto.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        mimeType: att.mimeType,
      })),
    );
  }

  async forwardEmail(
    userId: number,
    emailId: string,
    forwardDto: ForwardEmailDto,
  ): Promise<{ id: string; threadId: string }> {
    const result = await this.gmailService.forwardEmail(
      userId,
      emailId,
      forwardDto.to,
      forwardDto.body,
      forwardDto.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        mimeType: att.mimeType,
      })),
    );

    try {
      await this.indexEmailForSearch(userId, result.id);
    } catch (error) {
      this.logger.error(
        `Failed to index forwarded email ${result.id} for user ${userId}: ${error.message}`,
      );
    }

    return result;
  }

  async modifyEmail(
    userId: number,
    emailId: string,
    modifyDto: ModifyEmailDto,
  ): Promise<void> {
    await this.gmailService.modifyEmail(
      userId,
      emailId,
      modifyDto.addLabelIds,
      modifyDto.removeLabelIds,
    );
  }

  async markAsRead(userId: number, emailId: string): Promise<void> {
    await this.gmailService.modifyEmail(userId, emailId, [], ['UNREAD']);
  }

  async markAsUnread(userId: number, emailId: string): Promise<void> {
    await this.gmailService.modifyEmail(userId, emailId, ['UNREAD'], []);
  }

  async deleteEmail(
    userId: number,
    emailId: string,
    permanent: boolean = false,
  ): Promise<void> {
    await this.gmailService.deleteEmail(userId, emailId, permanent);
  }

  async getAttachment(
    userId: number,
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    return this.gmailService.getAttachment(userId, messageId, attachmentId);
  }

  /**
   * Get email kanban status (column name)
   */
  async getEmailStatus(
    userId: number,
    gmailId: string,
  ): Promise<EmailStatusResponseDto> {
    const email = await this.emailRepository.findOne({
      where: { userId, gmailId },
      relations: ['kanbanColumn'],
    });

    return {
      emailId: gmailId,
      status: email?.kanbanColumn?.name || 'Inbox',
      kanbanColumnId: email?.kanbanColumnId || null,
      updatedAt: email?.updatedAt || new Date(),
    };
  }

  /**
   * Update email kanban status by column ID or column name
   */
  async updateEmailStatus(
    userId: number,
    gmailId: string,
    statusOrColumnId: string | number,
    gmailLabelId?: string,
    oldGmailLabelId?: string,
  ): Promise<EmailStatusResponseDto> {
    let targetColumn: KanbanColumn | null = null;

    if (typeof statusOrColumnId === 'number') {
      targetColumn = await this.kanbanColumnRepository.findOne({
        where: { id: statusOrColumnId, userId },
      });
    } else {
      targetColumn = await this.getColumnByName(userId, statusOrColumnId);
    }

    if (!targetColumn) {
      targetColumn = await this.getDefaultInboxColumn(userId);
    }

    let email = await this.emailRepository.findOne({
      where: { userId, gmailId },
    });

    if (email) {
      email.kanbanColumnId = targetColumn?.id || null;
      email = await this.emailRepository.save(email);
    } else {
      email = this.emailRepository.create({
        userId,
        gmailId,
        kanbanColumnId: targetColumn?.id || null,
      });
      email = await this.emailRepository.save(email);
    }

    if (gmailLabelId || oldGmailLabelId) {
      try {
        const addLabelIds = gmailLabelId ? [gmailLabelId] : [];
        const removeLabelIds = oldGmailLabelId ? [oldGmailLabelId] : [];

        if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
          await this.gmailService.modifyEmail(
            userId,
            gmailId,
            addLabelIds,
            removeLabelIds,
          );
        }
      } catch (error) {
        // Log error but don't fail the operation - local status is still updated
        this.logger.warn(
          `[LABEL_SYNC] Failed to sync Gmail labels for ${gmailId}: ${error.message}`,
        );
      }
    }

    return {
      emailId: gmailId,
      status: targetColumn?.name || 'Inbox',
      kanbanColumnId: targetColumn?.id || null,
      updatedAt: email.updatedAt,
    };
  }

  /**
   * Get bulk email statuses
   */
  async getBulkEmailStatuses(
    userId: number,
    gmailIds: string[],
  ): Promise<EmailStatusResponseDto[]> {
    if (gmailIds.length === 0) {
      return [];
    }

    const emails = await this.emailRepository.find({
      where: {
        userId,
        gmailId: In(gmailIds),
      },
      relations: ['kanbanColumn'],
    });

    const emailMap = new Map<string, Email>();
    emails.forEach((email) => {
      emailMap.set(email.gmailId, email);
    });

    return gmailIds.map((gmailId) => {
      const email = emailMap.get(gmailId);
      return {
        emailId: gmailId,
        status: email?.kanbanColumn?.name || 'Inbox',
        kanbanColumnId: email?.kanbanColumnId || null,
        updatedAt: email?.updatedAt || new Date(),
      };
    });
  }

  async deleteEmailRecord(userId: number, gmailId: string): Promise<void> {
    await this.emailRepository.delete({ userId, gmailId });
  }

  /**
   * Snooze email until a specific time
   */
  async snoozeEmail(
    userId: number,
    gmailId: string,
    snoozeUntil: Date,
  ): Promise<void> {
    let email = await this.emailRepository.findOne({
      where: { userId, gmailId },
    });

    if (!email) {
      const inboxColumn = await this.getDefaultInboxColumn(userId);
      email = this.emailRepository.create({
        userId,
        gmailId,
        kanbanColumnId: inboxColumn?.id || null,
      });
      email = await this.emailRepository.save(email);
    }

    let snooze = await this.snoozeScheduleRepository.findOne({
      where: { emailId: email.id },
    });

    if (snooze) {
      snooze.snoozeUntil = snoozeUntil;
      snooze.returnToColumnId = email.kanbanColumnId;
    } else {
      snooze = this.snoozeScheduleRepository.create({
        emailId: email.id,
        snoozeUntil,
        returnToColumnId: email.kanbanColumnId,
      });
    }

    await this.snoozeScheduleRepository.save(snooze);
  }

  /**
   * Unsnooze an email
   */
  async unsnoozeEmail(userId: number, gmailId: string): Promise<void> {
    const email = await this.emailRepository.findOne({
      where: { userId, gmailId },
    });

    if (email) {
      await this.snoozeScheduleRepository.delete({ emailId: email.id });
    } else {
      this.logger.warn(
        `[UNSNOOZE] No email record found for ${gmailId} and user ${userId}`,
      );
    }
  }

  /**
   * Get all snoozed emails for a user
   */
  async getSnoozedEmails(userId: number): Promise<any[]> {
    const now = new Date();

    const snoozedEmails = await this.dataSource.query(
      `
      SELECT e."gmailId", s.snooze_until as "snoozeUntil"
      FROM snooze_schedules s
      JOIN emails e ON s."emailId" = e.id
      WHERE e."userId" = $1 AND s.snooze_until > $2
      ORDER BY s.snooze_until ASC
      `,
      [userId, now],
    );

    if (snoozedEmails.length === 0) {
      return [];
    }

    const emailsWithDetails = await Promise.all(
      snoozedEmails.map(async (snoozed: any) => {
        if (!snoozed.gmailId) {
          return null;
        }

        try {
          const emailDetail = await this.gmailService.getEmailDetail(
            userId,
            snoozed.gmailId,
          );
          return {
            id: emailDetail.id,
            threadId: emailDetail.threadId,
            subject: emailDetail.subject || '(No Subject)',
            from: emailDetail.from,
            to: emailDetail.to,
            cc: emailDetail.cc,
            body: emailDetail.body,
            preview: emailDetail.body?.substring(0, 200) || '',
            timestamp: emailDetail.receivedDate,
            receivedDate: emailDetail.receivedDate,
            isRead: emailDetail.isRead,
            isStarred: emailDetail.isStarred,
            labels: [],
            attachments: emailDetail.attachments || [],
            senderName: this.extractSenderName(emailDetail.from),
            snoozedUntil: snoozed.snoozeUntil,
          };
        } catch (error) {
          this.logger.error(
            `[GET_SNOOZED] Failed to fetch email ${snoozed.gmailId}: ${error.message}`,
          );
          return null;
        }
      }),
    );

    const filteredEmails = emailsWithDetails.filter((email) => email !== null);
    this.logger.log(
      `[GET_SNOOZED] Successfully fetched ${filteredEmails.length} snoozed emails for user ${userId}`,
    );
    return filteredEmails;
  }

  /**
   * Check and restore expired snoozed emails
   */
  async checkExpiredSnoozes(userId: number): Promise<string[]> {
    const now = new Date();
    this.logger.log(
      `[CHECK_EXPIRED] Checking expired snoozes for user ${userId} at ${now.toISOString()}`,
    );

    const expiredSnoozes = await this.dataSource.query(
      `
      SELECT s.id, s."emailId", s.return_to_column_id, e."gmailId"
      FROM snooze_schedules s
      JOIN emails e ON s."emailId" = e.id
      WHERE e."userId" = $1 AND s.snooze_until <= $2
      `,
      [userId, now],
    );

    const restoredGmailIds: string[] = [];

    for (const expired of expiredSnoozes) {
      if (expired.return_to_column_id) {
        await this.emailRepository.update(
          { id: expired.emailId },
          { kanbanColumnId: expired.return_to_column_id },
        );
      }

      await this.snoozeScheduleRepository.delete({ id: expired.id });
      restoredGmailIds.push(expired.gmailId);
    }

    return restoredGmailIds;
  }

  /**
   * Save or update email summary
   */
  async saveEmailSummary(
    userId: number,
    gmailId: string,
    summary: string,
  ): Promise<void> {
    let email = await this.emailRepository.findOne({
      where: { userId, gmailId },
    });

    if (!email) {
      const inboxColumn = await this.getDefaultInboxColumn(userId);
      email = this.emailRepository.create({
        userId,
        gmailId,
        kanbanColumnId: inboxColumn?.id || null,
        summary,
        summarizedAt: new Date(),
      });
    } else {
      email.summary = summary;
      email.summarizedAt = new Date();
    }

    await this.emailRepository.save(email);
  }

  /**
   * Get email summary
   */
  async getEmailSummary(
    userId: number,
    gmailId: string,
  ): Promise<string | null> {
    const email = await this.emailRepository.findOne({
      where: { userId, gmailId },
    });

    return email?.summary || null;
  }

  /**
   * Get email repository for controller access (summary feature)
   */
  get emailRepositoryAccess(): Repository<Email> {
    return this.emailRepository;
  }

  private stripHtmlTags(html: string | undefined | null): string {
    if (!html) return '';
    let text = html;
    text = text.replace(/<!DOCTYPE[\s\S]*?>/gi, ' ');
    text = text.replace(/<head[\s\S]*?<\/head>/gi, ' ');
    text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    text = text.replace(/<[^>]*>/g, ' ');
    return text.replace(/\s+/g, ' ').trim();
  }

  private extractSenderName(from: string): string {
    if (!from) return 'Unknown Sender';
    const match = from.match(/^(.+?)\s*<(.+)>$/);
    if (match && match[1]) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
    return from.split('@')[0];
  }

  private extractNameFromEmail(email: string): string {
    const match = email.match(/^(.+?)\s*<(.+)>$/);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
    return email;
  }
}
