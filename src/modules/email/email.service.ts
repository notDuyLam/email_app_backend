import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { GmailService } from '../gmail/gmail.service';
import { EmailStatus, KanbanStatus } from '../../entities/email-status.entity';
import { MailboxDto } from './dto/mailbox.dto';
import { EmailListResponseDto, EmailListItemDto } from './dto/email-list.dto';
import { EmailDetailDto } from './dto/email-detail.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
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

  constructor(
    private readonly gmailService: GmailService,
    @InjectRepository(EmailStatus)
    private readonly emailStatusRepository: Repository<EmailStatus>,
    private readonly searchService: SearchService,
  ) {}

  private mapToSearchDocument(
    emailId: string,
    detail: {
      subject: string;
      from: string;
      body: string;
      receivedDate: Date;
    },
    status?: EmailStatus,
  ): EmailSearchDocument {
    return {
      id: emailId,
      subject: detail.subject || '',
      senderName: this.extractNameFromEmail(detail.from),
      senderEmail: detail.from,
      snippet: this.stripHtmlTags(detail.body).substring(0, 200),
      receivedAt: detail.receivedDate?.toISOString?.(),
      status: status?.status,
    };
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
    // Calculate pageToken for pagination (Gmail uses pageToken, not page numbers)
    // For simplicity, we'll fetch from the beginning and use pageToken from previous calls
    // In a real implementation, you'd store pageToken in the frontend
    const result = await this.gmailService.getEmails(
      userId,
      mailboxId,
      page,
      pageSize,
      pageToken,
      search,
    );

    // Get all email IDs to fetch their status (including snoozedUntil)
    const emailIds = result.messages.slice(0, pageSize).map((msg) => msg.id);
    const emailStatuses = await this.emailStatusRepository.find({
      where: { emailId: In(emailIds), userId },
    });
    const statusMap = new Map(
      emailStatuses.map((status) => [status.emailId, status]),
    );

    // Fetch details for each message to get full info
    const emailDetails = await Promise.all(
      result.messages.slice(0, pageSize).map(async (msg) => {
        try {
          const detail = await this.gmailService.getEmailDetail(userId, msg.id);
          const status = statusMap.get(msg.id);

          // Auto-index email for search (async, don't wait)
          this.indexEmailForSearchAsync(userId, msg.id, detail, status).catch(
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
            snoozedUntil: status?.snoozeUntil || null, // Include snoozeUntil from status
          } as EmailListItemDto;
        } catch (error) {
          // If fetching detail fails, return minimal info
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
      isRead: item.status !== KanbanStatus.INBOX, // đơn giản: coi INBOX là chưa đọc
      snoozedUntil: null,
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
    };
  }

  /**
   * Auto-index email for search (async helper - doesn't throw errors)
   */
  private async indexEmailForSearchAsync(
    userId: number,
    emailId: string,
    detail?: any,
    status?: EmailStatus,
  ): Promise<void> {
    try {
      const doc = this.mapToSearchDocument(emailId, detail, status);
      await this.searchService.indexEmail(userId, doc);
    } catch (error) {
      // Silently fail - this is background indexing
      this.logger.debug(
        `Auto-index failed for email ${emailId}: ${error.message}`,
      );
    }
  }

  async indexEmailForSearch(userId: number, emailId: string): Promise<void> {
    const [detail, status] = await Promise.all([
      this.gmailService.getEmailDetail(userId, emailId),
      this.emailStatusRepository.findOne({ where: { userId, emailId } }),
    ]);

    const doc = this.mapToSearchDocument(emailId, detail, status);
    await this.searchService.indexEmail(userId, doc);
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

      const emailIds = messages.map((m) => m.id);

      const emailStatuses = await this.emailStatusRepository.find({
        where: { emailId: In(emailIds), userId },
      });
      const statusMap = new Map<string, EmailStatus>(
        emailStatuses.map((s) => [s.emailId, s]),
      );

      const docs: EmailSearchDocument[] = [];
      for (const msg of messages) {
        try {
          const detail = await this.gmailService.getEmailDetail(userId, msg.id);
          const status = statusMap.get(msg.id);
          const doc = this.mapToSearchDocument(msg.id, detail, status);
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

    this.logger.log(
      `[REINDEX] Indexed ${totalIndexed} emails for user ${userId} in mailbox ${mailboxId}`,
    );

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

    // Index sent email for search (best-effort)
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
    // Remove UNREAD label to mark as read
    await this.gmailService.modifyEmail(userId, emailId, [], ['UNREAD']);
  }

  async markAsUnread(userId: number, emailId: string): Promise<void> {
    // Add UNREAD label to mark as unread
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

  async getEmailStatus(
    userId: number,
    emailId: string,
  ): Promise<EmailStatusResponseDto> {
    const emailStatus = await this.emailStatusRepository.findOne({
      where: { userId, emailId },
    });

    return {
      emailId,
      status: emailStatus?.status || KanbanStatus.INBOX,
      updatedAt: emailStatus?.updatedAt || new Date(),
    };
  }

  async updateEmailStatus(
    userId: number,
    emailId: string,
    status: KanbanStatus,
  ): Promise<EmailStatusResponseDto> {
    let emailStatus = await this.emailStatusRepository.findOne({
      where: { userId, emailId },
    });

    if (emailStatus) {
      emailStatus.status = status;
      // Clear snoozeUntil when moving OUT of SNOOZED status
      if (status !== KanbanStatus.SNOOZED && emailStatus.snoozeUntil) {
        this.logger.log(
          `[UPDATE_STATUS] Clearing snoozeUntil for email ${emailId} (moving from SNOOZED to ${status})`,
        );
        emailStatus.snoozeUntil = null;
      }
      emailStatus = await this.emailStatusRepository.save(emailStatus);
    } else {
      emailStatus = this.emailStatusRepository.create({
        userId,
        emailId,
        status,
        snoozeUntil: null, // Ensure snoozeUntil is null for new status entries
      });
      emailStatus = await this.emailStatusRepository.save(emailStatus);
    }

    return {
      emailId: emailStatus.emailId,
      status: emailStatus.status,
      updatedAt: emailStatus.updatedAt,
    };
  }

  async getBulkEmailStatuses(
    userId: number,
    emailIds: string[],
  ): Promise<EmailStatusResponseDto[]> {
    if (emailIds.length === 0) {
      return [];
    }

    const emailStatuses = await this.emailStatusRepository.find({
      where: {
        userId,
        emailId: In(emailIds),
      },
    });

    // Create a map for quick lookup
    const statusMap = new Map<string, EmailStatus>();
    emailStatuses.forEach((status) => {
      statusMap.set(status.emailId, status);
    });

    // Return statuses for all requested emails, defaulting to INBOX
    return emailIds.map((emailId) => {
      const emailStatus = statusMap.get(emailId);
      return {
        emailId,
        status: emailStatus?.status || KanbanStatus.INBOX,
        updatedAt: emailStatus?.updatedAt || new Date(),
      };
    });
  }

  async deleteEmailStatus(userId: number, emailId: string): Promise<void> {
    await this.emailStatusRepository.delete({ userId, emailId });
  }

  // Snooze email until a specific time
  async snoozeEmail(
    userId: number,
    emailId: string,
    snoozeUntil: Date,
  ): Promise<void> {
    this.logger.log(
      `[SNOOZE] User ${userId} snoozing email ${emailId} until ${snoozeUntil.toISOString()}`,
    );

    let emailStatus = await this.emailStatusRepository.findOne({
      where: { userId, emailId },
    });

    if (!emailStatus) {
      this.logger.log(
        `[SNOOZE] Creating new email status for email ${emailId}`,
      );
      emailStatus = this.emailStatusRepository.create({
        userId,
        emailId,
        status: KanbanStatus.SNOOZED,
        snoozeUntil,
      });
    } else {
      this.logger.log(
        `[SNOOZE] Updating existing email status for email ${emailId} from ${emailStatus.status} to SNOOZED`,
      );
      emailStatus.status = KanbanStatus.SNOOZED;
      emailStatus.snoozeUntil = snoozeUntil;
    }

    await this.emailStatusRepository.save(emailStatus);
    this.logger.log(
      `[SNOOZE] Successfully snoozed email ${emailId} for user ${userId}`,
    );
  }

  // Unsnooze an email (remove snooze and return to INBOX)
  async unsnoozeEmail(userId: number, emailId: string): Promise<void> {
    this.logger.log(`[UNSNOOZE] User ${userId} unsnoozing email ${emailId}`);

    const emailStatus = await this.emailStatusRepository.findOne({
      where: { userId, emailId },
    });

    if (emailStatus) {
      this.logger.log(
        `[UNSNOOZE] Found email status for ${emailId}, changing from ${emailStatus.status} to INBOX`,
      );
      emailStatus.status = KanbanStatus.INBOX;
      emailStatus.snoozeUntil = null;
      await this.emailStatusRepository.save(emailStatus);
      this.logger.log(
        `[UNSNOOZE] Successfully unsnoozed email ${emailId} for user ${userId}`,
      );
    } else {
      this.logger.warn(
        `[UNSNOOZE] No email status found for email ${emailId} and user ${userId}`,
      );
    }
  }

  // Get all snoozed emails for a user with full email details
  async getSnoozedEmails(userId: number): Promise<any[]> {
    this.logger.log(`[GET_SNOOZED] Fetching snoozed emails for user ${userId}`);

    // Find all email statuses that have snoozeUntil in the future
    // This covers both explicit SNOOZED status and any emails with active snooze
    const now = new Date();
    const snoozedStatuses = await this.emailStatusRepository
      .createQueryBuilder('status')
      .where('status.userId = :userId', { userId })
      .andWhere('status.snoozeUntil > :now', { now })
      .orderBy('status.snoozeUntil', 'ASC')
      .getMany();

    this.logger.log(
      `[GET_SNOOZED] Found ${snoozedStatuses.length} snoozed emails for user ${userId}`,
    );

    if (snoozedStatuses.length === 0) {
      this.logger.log(
        `[GET_SNOOZED] No snoozed emails found for user ${userId}`,
      );
      return [];
    }

    // Fetch email details from Gmail for each snoozed email
    const emailsWithDetails = await Promise.all(
      snoozedStatuses.map(async (status) => {
        // Validate emailId
        if (
          !status.emailId ||
          typeof status.emailId !== 'string' ||
          status.emailId.trim() === ''
        ) {
          this.logger.error(
            `[GET_SNOOZED] Invalid emailId for status ${status.id}: ${status.emailId}`,
          );
          return null;
        }

        try {
          this.logger.log(
            `[GET_SNOOZED] Fetching Gmail details for email ${status.emailId}`,
          );
          const emailDetail = await this.gmailService.getEmailDetail(
            userId,
            status.emailId,
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
            snoozedUntil: status.snoozeUntil, // Use snoozedUntil for frontend consistency
          };
        } catch (error) {
          this.logger.error(
            `[GET_SNOOZED] Failed to fetch email ${status.emailId}: ${error.message}`,
          );
          console.error(`Failed to fetch email ${status.emailId}:`, error);
          return null;
        }
      }),
    );

    // Filter out null values (failed fetches)
    const filteredEmails = emailsWithDetails.filter((email) => email !== null);
    this.logger.log(
      `[GET_SNOOZED] Successfully fetched ${filteredEmails.length} snoozed emails for user ${userId}`,
    );
    return filteredEmails;
  }

  private stripHtmlTags(html: string | undefined | null): string {
    if (!html) return '';
    let text = html;
    // Remove DOCTYPE and head sections which often contain meta/style only
    text = text.replace(/<!DOCTYPE[\s\S]*?>/gi, ' ');
    text = text.replace(/<head[\s\S]*?<\/head>/gi, ' ');
    // Remove script and style tags altogether
    text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    // Collapse whitespace
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

  // Check and restore expired snoozed emails
  async checkExpiredSnoozes(userId: number): Promise<string[]> {
    const now = new Date();
    this.logger.log(
      `[CHECK_EXPIRED] Checking expired snoozes for user ${userId} at ${now.toISOString()}`,
    );

    // Find all emails with snoozeUntil in the past (expired)
    const expiredStatuses = await this.emailStatusRepository
      .createQueryBuilder('status')
      .where('status.userId = :userId', { userId })
      .andWhere('status.snoozeUntil IS NOT NULL')
      .andWhere('status.snoozeUntil <= :now', { now })
      .getMany();

    this.logger.log(
      `[CHECK_EXPIRED] Found ${expiredStatuses.length} expired snoozed emails for user ${userId}`,
    );

    const restoredEmailIds: string[] = [];

    for (const status of expiredStatuses) {
      this.logger.log(
        `[CHECK_EXPIRED] Restoring email ${status.emailId} from ${status.status} to INBOX (clearing snooze)`,
      );
      status.status = KanbanStatus.INBOX;
      status.snoozeUntil = null;
      await this.emailStatusRepository.save(status);
      restoredEmailIds.push(status.emailId);
    }

    if (restoredEmailIds.length > 0) {
      this.logger.log(
        `[CHECK_EXPIRED] Successfully restored ${restoredEmailIds.length} emails for user ${userId}: ${restoredEmailIds.join(', ')}`,
      );
    }

    return restoredEmailIds;
  }

  // Save or update email summary
  async saveEmailSummary(
    userId: number,
    emailId: string,
    summary: string,
  ): Promise<void> {
    let emailStatus = await this.emailStatusRepository.findOne({
      where: { userId, emailId },
    });

    if (!emailStatus) {
      emailStatus = this.emailStatusRepository.create({
        userId,
        emailId,
        status: KanbanStatus.INBOX,
        summary,
        summarizedAt: new Date(),
      });
    } else {
      emailStatus.summary = summary;
      emailStatus.summarizedAt = new Date();
    }

    await this.emailStatusRepository.save(emailStatus);
  }

  // Get email summary
  async getEmailSummary(
    userId: number,
    emailId: string,
  ): Promise<string | null> {
    const emailStatus = await this.emailStatusRepository.findOne({
      where: { userId, emailId },
    });

    return emailStatus?.summary || null;
  }

  private extractNameFromEmail(email: string): string {
    // Extract name from "Name <email@example.com>" format
    const match = email.match(/^(.+?)\s*<(.+)>$/);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
    // If no name, return email address
    return email;
  }
}
