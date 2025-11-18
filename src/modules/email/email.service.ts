import { Injectable } from '@nestjs/common';
import { MailboxDto } from './dto/mailbox.dto';
import { EmailListResponseDto } from './dto/email-list.dto';
import { EmailDetailDto } from './dto/email-detail.dto';

@Injectable()
export class EmailService {
  // Placeholder methods - frontend will handle all mocking
  async getMailboxes(): Promise<MailboxDto[]> {
    return [];
  }

  async getEmailsByMailbox(
    mailboxId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<EmailListResponseDto> {
    return {
      emails: [],
      total: 0,
      page,
      pageSize,
    };
  }

  async getEmailById(emailId: string): Promise<EmailDetailDto | null> {
    return null;
  }
}

