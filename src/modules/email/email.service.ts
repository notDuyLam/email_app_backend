import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GmailService } from '../gmail/gmail.service';
import { MailboxDto } from './dto/mailbox.dto';
import { EmailListResponseDto, EmailListItemDto } from './dto/email-list.dto';
import { EmailDetailDto } from './dto/email-detail.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';

@Injectable()
export class EmailService {
  constructor(private readonly gmailService: GmailService) {}

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
  ): Promise<EmailListResponseDto> {
    // Calculate pageToken for pagination (Gmail uses pageToken, not page numbers)
    // For simplicity, we'll fetch from the beginning and use pageToken from previous calls
    // In a real implementation, you'd store pageToken in the frontend
    const result = await this.gmailService.getEmails(userId, mailboxId, page, pageSize);

    // Fetch details for each message to get full info
    const emailDetails = await Promise.all(
      result.messages.slice(0, pageSize).map(async (msg) => {
        try {
          const detail = await this.gmailService.getEmailDetail(userId, msg.id);
          return {
            id: detail.id,
            senderName: this.extractNameFromEmail(detail.from),
            subject: detail.subject,
            preview: detail.body.substring(0, 100) || '',
            timestamp: detail.receivedDate,
            isStarred: detail.isStarred,
            isRead: detail.isRead,
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
          } as EmailListItemDto;
        }
      }),
    );

    return {
      emails: emailDetails,
      total: result.total,
      page,
      pageSize,
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

  async sendEmail(userId: number, sendEmailDto: SendEmailDto): Promise<{ id: string; threadId: string }> {
    return this.gmailService.sendEmail(
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
  }

  async replyEmail(userId: number, emailId: string, replyDto: ReplyEmailDto): Promise<{ id: string; threadId: string }> {
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

  async modifyEmail(userId: number, emailId: string, modifyDto: ModifyEmailDto): Promise<void> {
    await this.gmailService.modifyEmail(
      userId,
      emailId,
      modifyDto.addLabelIds,
      modifyDto.removeLabelIds,
    );
  }

  async deleteEmail(userId: number, emailId: string, permanent: boolean = false): Promise<void> {
    await this.gmailService.deleteEmail(userId, emailId, permanent);
  }

  async getAttachment(
    userId: number,
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    return this.gmailService.getAttachment(userId, messageId, attachmentId);
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
