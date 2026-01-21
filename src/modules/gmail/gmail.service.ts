import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GmailToken } from '../../entities/gmail-token.entity';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private refreshPromises: Map<number, Promise<string>> = new Map();
  private oauth2Client: OAuth2Client;

  constructor(
    @InjectRepository(GmailToken)
    private gmailTokenRepository: Repository<GmailToken>,
    private configService: ConfigService,
  ) {
    const clientId = this.configService.get<string>('gmail.clientId');
    const clientSecret = this.configService.get<string>('gmail.clientSecret');
    const redirectUri = this.configService.get<string>('gmail.redirectUri');

    if (!clientId || !clientSecret) {
      throw new Error('Gmail OAuth credentials not configured');
    }

    this.oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  // OAuth Flow Methods
  getAuthUrl(): string {
    const scopes = this.configService.get<string[]>('gmail.scopes') || [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to always get refresh token
    });
  }

  async handleCallback(code: string): Promise<{
    refreshToken: string;
    accessToken: string;
    expiryDate: number | undefined;
    userInfo: { email: string; name?: string; sub: string };
  }> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        throw new BadRequestException('No refresh token received from Google');
      }

      if (!tokens.access_token) {
        throw new BadRequestException('No access token received from Google');
      }

      // Use Gmail API to get user email
      const tempOAuth2Client = new OAuth2Client(
        this.configService.get<string>('gmail.clientId'),
        this.configService.get<string>('gmail.clientSecret'),
        this.configService.get<string>('gmail.redirectUri'),
      );
      tempOAuth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });

      const gmail = google.gmail({ version: 'v1', auth: tempOAuth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });

      const email = profile.data.emailAddress;

      if (!email) {
        throw new BadRequestException(
          'Unable to retrieve user email from Gmail profile',
        );
      }

      return {
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        expiryDate: tokens.expiry_date,
        userInfo: {
          email: email,
          name: email.split('@')[0],
          sub: email,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to handle OAuth callback: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to handle OAuth callback');
    }
  }

  // Token Management Methods
  async saveToken(
    userId: number,
    refreshToken: string,
    accessToken?: string,
    expiryDate?: number,
  ): Promise<GmailToken> {
    let token = await this.gmailTokenRepository.findOne({
      where: { userId },
    });

    const expiry = expiryDate ? new Date(expiryDate) : null;

    if (token) {
      token.refreshToken = refreshToken;
      if (accessToken) {
        token.accessToken = accessToken;
        token.accessTokenExpiry = expiry;
      }
      token.isActive = true;
    } else {
      token = this.gmailTokenRepository.create({
        userId,
        refreshToken,
        accessToken: accessToken || null,
        accessTokenExpiry: expiry,
        isActive: true,
      });
    }

    return this.gmailTokenRepository.save(token);
  }

  async getStoredToken(userId: number): Promise<GmailToken | null> {
    return this.gmailTokenRepository.findOne({
      where: { userId, isActive: true },
    });
  }

  async getAccessToken(userId: number): Promise<string> {
    const token = await this.getStoredToken(userId);

    if (!token) {
      throw new UnauthorizedException(
        'Gmail not connected. Please connect your Gmail account.',
      );
    }

    // Check if access token is still valid
    if (
      token.accessToken &&
      token.accessTokenExpiry &&
      token.accessTokenExpiry > new Date()
    ) {
      return token.accessToken;
    }

    // Concurrency guard: if refresh in progress, await it
    if (this.refreshPromises.has(userId)) {
      return this.refreshPromises.get(userId)!;
    }

    // Start refresh
    const refreshPromise = this.refreshGmailToken(userId, token.refreshToken);
    this.refreshPromises.set(userId, refreshPromise);

    try {
      const newAccessToken = await refreshPromise;
      return newAccessToken;
    } finally {
      this.refreshPromises.delete(userId);
    }
  }

  private async refreshGmailToken(
    userId: number,
    refreshToken: string,
  ): Promise<string> {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new UnauthorizedException('Failed to refresh access token');
      }

      // Save new access token
      const expiry = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : null;
      await this.saveToken(
        userId,
        refreshToken,
        credentials.access_token,
        credentials.expiry_date,
      );

      return credentials.access_token;
    } catch (error) {
      // If refresh fails, clear tokens
      await this.clearToken(userId);
      throw new UnauthorizedException(
        'Gmail token expired. Please reconnect your account.',
      );
    }
  }

  async clearToken(userId: number): Promise<void> {
    const token = await this.getStoredToken(userId);
    if (token) {
      token.isActive = false;
      token.accessToken = null;
      token.accessTokenExpiry = null;
      await this.gmailTokenRepository.save(token);
    }
  }

  async revokeToken(userId: number): Promise<void> {
    const token = await this.getStoredToken(userId);
    if (token) {
      try {
        this.oauth2Client.setCredentials({ refresh_token: token.refreshToken });
        await this.oauth2Client.revokeCredentials();
      } catch (error) {
        // Continue even if revoke fails
      }
      await this.clearToken(userId);
    }
  }

  // Helper Methods
  private async createGmailClient(userId: number) {
    const accessToken = await this.getAccessToken(userId);
    this.oauth2Client.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  private getHeader(headers: any[], name: string): string | undefined {
    return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
      ?.value;
  }

  private decodeBody(data: string): string {
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  private parseEmailHeaders(headers: any[]): {
    from: string;
    to: string;
    subject: string;
    date: string;
    cc?: string;
    messageId?: string;
    references?: string;
  } {
    return {
      from: this.getHeader(headers, 'From') || '',
      to: this.getHeader(headers, 'To') || '',
      subject: this.getHeader(headers, 'Subject') || '',
      date: this.getHeader(headers, 'Date') || '',
      cc: this.getHeader(headers, 'Cc'),
      messageId: this.getHeader(headers, 'Message-ID'),
      references: this.getHeader(headers, 'References'),
    };
  }

  private parseEmailBody(payload: any): {
    text: string | null;
    html: string | null;
  } {
    let text: string | null = null;
    let html: string | null = null;

    // If payload has direct body data (simple message)
    if (payload.body?.data) {
      const decoded = this.decodeBody(payload.body.data);
      if (payload.mimeType === 'text/plain') {
        text = decoded;
      } else if (payload.mimeType === 'text/html') {
        html = decoded;
      }
    }

    // If payload has parts (multipart message)
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          text = this.decodeBody(part.body.data);
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          html = this.decodeBody(part.body.data);
        }

        // Recursively check nested parts
        if (part.parts) {
          const nested = this.parseEmailBody(part);
          if (nested.text) text = nested.text;
          if (nested.html) html = nested.html;
        }
      }
    }

    return { text, html };
  }

  private parseAttachments(payload: any): Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    const attachments: Array<{
      id: string;
      filename: string;
      mimeType: string;
      size: number;
    }> = [];

    const processPart = (part: any) => {
      if (part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename || 'attachment',
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }

      if (part.parts) {
        for (const subPart of part.parts) {
          processPart(subPart);
        }
      }
    };

    if (payload.parts) {
      for (const part of payload.parts) {
        processPart(part);
      }
    }

    return attachments;
  }

  private encodeMessage(message: string): string {
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Gmail API Operations
  async getMailboxes(
    userId: number,
  ): Promise<Array<{ id: string; name: string; unreadCount?: number }>> {
    try {
      const gmail = await this.createGmailClient(userId);
      const response = await gmail.users.labels.list({ userId: 'me' });

      if (!response.data.labels) {
        return [];
      }

      // Filter out system labels that shouldn't be shown as mailboxes
      const hiddenLabels = [
        'CATEGORY_PERSONAL',
        'CATEGORY_SOCIAL',
        'CATEGORY_PROMOTIONS',
        'CATEGORY_UPDATES',
        'CATEGORY_FORUMS',
      ];

      return response.data.labels
        .filter((label) => {
          // Show system labels like INBOX, SENT, DRAFT, etc.
          // Hide category labels and labels that are not visible
          return (
            (label.type === 'system' ||
              (label.type === 'user' &&
                label.labelListVisibility !== 'labelHide')) &&
            !hiddenLabels.includes(label.id || '')
          );
        })
        .map((label) => ({
          id: label.id || '',
          name: label.name || '',
          unreadCount: label.messagesUnread,
        }));
    } catch (error: any) {
      if (error.code === 401) {
        // Token expired, try to refresh and retry once
        await this.getAccessToken(userId); // This will refresh
        const gmail = await this.createGmailClient(userId);
        const response = await gmail.users.labels.list({ userId: 'me' });
        if (!response.data.labels) return [];
        return response.data.labels
          .filter(
            (label) =>
              label.type === 'system' ||
              label.labelListVisibility !== 'labelHide',
          )
          .map((label) => ({
            id: label.id || '',
            name: label.name || '',
            unreadCount: label.messagesUnread,
          }));
      }
      throw new InternalServerErrorException(
        `Failed to fetch mailboxes: ${error.message}`,
      );
    }
  }

  async getEmails(
    userId: number,
    labelId: string,
    page: number = 1,
    pageSize: number = 20,
    pageToken?: string,
    search?: string,
  ): Promise<{
    messages: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    total: number;
  }> {
    try {
      const gmail = await this.createGmailClient(userId);

      const isAll =
        labelId === 'ALL' || labelId === 'ALL_MAIL' || labelId === 'ALL_EMAILS';

      // Build query for search
      // - For specific labels: keep `in:<label>` behavior
      // - For ALL: do not constrain by label; just use search (if any)
      let q: string | undefined = undefined;
      if (search && search.trim()) {
        q = search.trim();
      }
      if (!isAll) {
        const inClause = `in:${labelId.toLowerCase()}`;
        q = q ? `${q} ${inClause}` : inClause;
      }

      const response = await gmail.users.messages.list({
        userId: 'me',
        ...(isAll ? {} : { labelIds: [labelId] }),
        maxResults: pageSize,
        pageToken: pageToken,
        q,
      });

      return {
        messages: (response.data.messages || []).map((msg) => ({
          id: msg.id || '',
          threadId: msg.threadId || '',
        })),
        nextPageToken: response.data.nextPageToken || undefined,
        total: response.data.resultSizeEstimate || 0,
      };
    } catch (error: any) {
      if (error.code === 401) {
        await this.getAccessToken(userId);
        const gmail = await this.createGmailClient(userId);

        const isAll =
          labelId === 'ALL' ||
          labelId === 'ALL_MAIL' ||
          labelId === 'ALL_EMAILS';

        // Build query for search on retry
        let q: string | undefined = undefined;
        if (search && search.trim()) {
          q = search.trim();
        }
        if (!isAll) {
          const inClause = `in:${labelId.toLowerCase()}`;
          q = q ? `${q} ${inClause}` : inClause;
        }

        const response = await gmail.users.messages.list({
          userId: 'me',
          ...(isAll ? {} : { labelIds: [labelId] }),
          maxResults: pageSize,
          pageToken: pageToken,
          q,
        });
        return {
          messages: (response.data.messages || []).map((msg) => ({
            id: msg.id || '',
            threadId: msg.threadId || '',
          })),
          nextPageToken: response.data.nextPageToken || undefined,
          total: response.data.resultSizeEstimate || 0,
        };
      }
      throw new InternalServerErrorException(
        `Failed to fetch emails: ${error.message}`,
      );
    }
  }

  async getEmailDetail(
    userId: number,
    messageId: string,
  ): Promise<{
    id: string;
    threadId: string;
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    receivedDate: Date;
    body: string;
    html?: string;
    attachments: Array<{
      id: string;
      name: string;
      size: number;
      type: string;
    }>;
    isStarred: boolean;
    isRead: boolean;
    labelIds: string[];
  }> {
    try {
      const gmail = await this.createGmailClient(userId);
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      if (!message) {
        throw new BadRequestException('Message not found');
      }

      const payload = message.payload;
      if (!payload) {
        throw new BadRequestException('Message payload not found');
      }

      const headers = this.parseEmailHeaders(payload.headers || []);
      const body = this.parseEmailBody(payload);
      const attachments = this.parseAttachments(payload);

      // Parse to addresses
      const toAddresses = headers.to
        ? headers.to.split(',').map((addr) => addr.trim())
        : [];
      const ccAddresses = headers.cc
        ? headers.cc.split(',').map((addr) => addr.trim())
        : undefined;

      return {
        id: message.id || '',
        threadId: message.threadId || '',
        from: headers.from,
        to: toAddresses,
        cc: ccAddresses,
        subject: headers.subject,
        receivedDate: new Date(parseInt(message.internalDate || '0', 10)),
        body: body.html || body.text || '',
        html: body.html || undefined,
        attachments: attachments.map((att) => ({
          id: att.id,
          name: att.filename,
          size: att.size,
          type: att.mimeType,
        })),
        isStarred: message.labelIds?.includes('STARRED') || false,
        isRead: !message.labelIds?.includes('UNREAD'),
        labelIds: message.labelIds || [],
      };
    } catch (error: any) {
      if (error.code === 401) {
        await this.getAccessToken(userId);
        return this.getEmailDetail(userId, messageId);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to fetch email detail: ${error.message}`,
      );
    }
  }

  async getAttachment(
    userId: number,
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    try {
      const gmail = await this.createGmailClient(userId);
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      if (!response.data.data) {
        throw new BadRequestException('Attachment data not found');
      }

      // Get message to find attachment metadata
      const messageResponse = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const payload = messageResponse.data.payload;
      let filename = 'attachment';
      let mimeType = 'application/octet-stream';

      const findAttachment = (part: any): any => {
        if (part.body?.attachmentId === attachmentId) {
          return part;
        }
        if (part.parts) {
          for (const subPart of part.parts) {
            const found = findAttachment(subPart);
            if (found) return found;
          }
        }
        return null;
      };

      if (payload?.parts) {
        const attachmentPart = findAttachment(payload);
        if (attachmentPart) {
          filename = attachmentPart.filename || 'attachment';
          mimeType = attachmentPart.mimeType || 'application/octet-stream';
        }
      }

      const data = Buffer.from(response.data.data, 'base64');

      return { data, mimeType, filename };
    } catch (error: any) {
      if (error.code === 401) {
        await this.getAccessToken(userId);
        return this.getAttachment(userId, messageId, attachmentId);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to fetch attachment: ${error.message}`,
      );
    }
  }

  async sendEmail(
    userId: number,
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[],
    attachments?: Array<{
      filename: string;
      content: string;
      mimeType: string;
    }>,
  ): Promise<{ id: string; threadId: string }> {
    try {
      const gmail = await this.createGmailClient(userId);

      // Get user email for From header
      const token = await this.getStoredToken(userId);
      if (!token) {
        throw new UnauthorizedException('Gmail not connected');
      }

      let message: string;

      if (attachments && attachments.length > 0) {
        // Create multipart message with attachments
        const boundary = `boundary_${Date.now()}`;
        const messageLines: string[] = [];

        messageLines.push(`To: ${to.join(', ')}`);
        if (cc && cc.length > 0) {
          messageLines.push(`Cc: ${cc.join(', ')}`);
        }
        if (bcc && bcc.length > 0) {
          messageLines.push(`Bcc: ${bcc.join(', ')}`);
        }
        messageLines.push(`Subject: ${subject}`);
        messageLines.push(`MIME-Version: 1.0`);
        messageLines.push(
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
        );
        messageLines.push('');

        // Add body part
        messageLines.push(`--${boundary}`);
        messageLines.push('Content-Type: text/html; charset=utf-8');
        messageLines.push('Content-Transfer-Encoding: base64');
        messageLines.push('');
        messageLines.push(Buffer.from(body).toString('base64'));
        messageLines.push('');

        // Add attachment parts
        for (const attachment of attachments) {
          messageLines.push(`--${boundary}`);
          messageLines.push(`Content-Type: ${attachment.mimeType}`);
          messageLines.push(
            `Content-Disposition: attachment; filename="${attachment.filename}"`,
          );
          messageLines.push('Content-Transfer-Encoding: base64');
          messageLines.push('');
          // Content should already be base64 from frontend
          messageLines.push(attachment.content);
          messageLines.push('');
        }

        messageLines.push(`--${boundary}--`);
        message = messageLines.join('\n');
      } else {
        // Simple message without attachments
        const messageLines: string[] = [];
        messageLines.push(`To: ${to.join(', ')}`);
        if (cc && cc.length > 0) {
          messageLines.push(`Cc: ${cc.join(', ')}`);
        }
        if (bcc && bcc.length > 0) {
          messageLines.push(`Bcc: ${bcc.join(', ')}`);
        }
        messageLines.push(`Subject: ${subject}`);
        messageLines.push('Content-Type: text/html; charset=utf-8');
        messageLines.push('');
        messageLines.push(body);
        message = messageLines.join('\n');
      }

      const encodedMessage = this.encodeMessage(message);

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      return {
        id: response.data.id || '',
        threadId: response.data.threadId || '',
      };
    } catch (error: any) {
      if (error.code === 401) {
        await this.getAccessToken(userId);
        return this.sendEmail(userId, to, subject, body, cc, bcc, attachments);
      }
      throw new InternalServerErrorException(
        `Failed to send email: ${error.message}`,
      );
    }
  }

  async replyEmail(
    userId: number,
    originalMessageId: string,
    body: string,
    attachments?: Array<{
      filename: string;
      content: string;
      mimeType: string;
    }>,
  ): Promise<{ id: string; threadId: string }> {
    try {
      // Get original message
      const originalMessage = await this.getEmailDetail(
        userId,
        originalMessageId,
      );
      const gmail = await this.createGmailClient(userId);

      // Get full original message for headers
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: originalMessageId,
        format: 'full',
      });

      const headers = this.parseEmailHeaders(
        fullMessage.data.payload?.headers || [],
      );
      const messageId = headers.messageId || '';
      const references = headers.references || messageId;

      // Create reply subject with proper encoding
      const subject = `Re: ${originalMessage.subject}`;
      const encodedSubject = /[^\x00-\x7F]/.test(subject)
        ? `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`
        : subject;

      // Create reply message
      const messageLines: string[] = [];
      messageLines.push(`To: ${originalMessage.from}`);
      messageLines.push(`Subject: ${encodedSubject}`);
      messageLines.push(`In-Reply-To: ${messageId}`);
      messageLines.push(`References: ${references}`);
      messageLines.push('MIME-Version: 1.0');
      messageLines.push('Content-Type: text/html; charset=utf-8');
      messageLines.push('Content-Transfer-Encoding: base64');
      messageLines.push('');
      messageLines.push(Buffer.from(body, 'utf-8').toString('base64'));

      const message = messageLines.join('\n');
      const encodedMessage = this.encodeMessage(message);

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: originalMessage.threadId,
        },
      });

      return {
        id: response.data.id || '',
        threadId: response.data.threadId || '',
      };
    } catch (error: any) {
      if (error.code === 401) {
        await this.getAccessToken(userId);
        return this.replyEmail(userId, originalMessageId, body, attachments);
      }
      throw new InternalServerErrorException(
        `Failed to reply email: ${error.message}`,
      );
    }
  }

  async forwardEmail(
    userId: number,
    originalMessageId: string,
    to: string[],
    body?: string,
    attachments?: Array<{
      filename: string;
      content: string;
      mimeType: string;
    }>,
  ): Promise<{ id: string; threadId: string }> {
    try {
      // Get original message details
      const originalMessage = await this.getEmailDetail(
        userId,
        originalMessageId,
      );
      const gmail = await this.createGmailClient(userId);

      // Create forwarded message subject
      const subject = originalMessage.subject.startsWith('Fwd:')
        ? originalMessage.subject
        : `Fwd: ${originalMessage.subject}`;

      // Encode subject for non-ASCII characters (RFC 2047)
      const encodedSubject = /[^\x00-\x7F]/.test(subject)
        ? `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`
        : subject;

      // Build forward body with original message context
      const forwardedBody = `
${body || ''}

---------- Forwarded message ---------
From: ${originalMessage.from}
Date: ${new Date(originalMessage.receivedDate).toLocaleString()}
Subject: ${originalMessage.subject}
To: ${originalMessage.to.join(', ')}

${originalMessage.body}
`;

      // Check if we need multipart for attachments
      if (attachments && attachments.length > 0) {
        // Create multipart message with attachments
        const boundary = `boundary_${Date.now()}`;
        const messageLines: string[] = [];

        messageLines.push(`To: ${to.join(', ')}`);
        messageLines.push(`Subject: ${encodedSubject}`);
        messageLines.push(`MIME-Version: 1.0`);
        messageLines.push(
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
        );
        messageLines.push('');

        // Add body part
        messageLines.push(`--${boundary}`);
        messageLines.push('Content-Type: text/html; charset=utf-8');
        messageLines.push('Content-Transfer-Encoding: base64');
        messageLines.push('');
        messageLines.push(Buffer.from(forwardedBody).toString('base64'));
        messageLines.push('');

        // Add attachment parts
        for (const attachment of attachments) {
          messageLines.push(`--${boundary}`);
          messageLines.push(`Content-Type: ${attachment.mimeType}`);
          messageLines.push(
            `Content-Disposition: attachment; filename="${attachment.filename}"`,
          );
          messageLines.push('Content-Transfer-Encoding: base64');
          messageLines.push('');
          messageLines.push(attachment.content);
          messageLines.push('');
        }

        messageLines.push(`--${boundary}--`);
        const message = messageLines.join('\n');
        const encodedMessage = this.encodeMessage(message);

        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
          },
        });

        return {
          id: response.data.id || '',
          threadId: response.data.threadId || '',
        };
      } else {
        // Simple message without attachments - use base64 encoding for body
        const messageLines: string[] = [];
        messageLines.push(`To: ${to.join(', ')}`);
        messageLines.push(`Subject: ${encodedSubject}`);
        messageLines.push('MIME-Version: 1.0');
        messageLines.push('Content-Type: text/html; charset=utf-8');
        messageLines.push('Content-Transfer-Encoding: base64');
        messageLines.push('');
        messageLines.push(
          Buffer.from(forwardedBody, 'utf-8').toString('base64'),
        );

        const message = messageLines.join('\n');
        const encodedMessage = this.encodeMessage(message);

        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
          },
        });

        return {
          id: response.data.id || '',
          threadId: response.data.threadId || '',
        };
      }
    } catch (error: any) {
      if (error.code === 401) {
        await this.getAccessToken(userId);
        return this.forwardEmail(
          userId,
          originalMessageId,
          to,
          body,
          attachments,
        );
      }
      throw new InternalServerErrorException(
        `Failed to forward email: ${error.message}`,
      );
    }
  }

  async modifyEmail(
    userId: number,
    messageId: string,
    addLabelIds?: string[],
    removeLabelIds?: string[],
  ): Promise<void> {
    try {
      const gmail = await this.createGmailClient(userId);
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: addLabelIds || [],
          removeLabelIds: removeLabelIds || [],
        },
      });
    } catch (error: any) {
      if (error.code === 401) {
        await this.getAccessToken(userId);
        await this.modifyEmail(userId, messageId, addLabelIds, removeLabelIds);
        return;
      }
      throw new InternalServerErrorException(
        `Failed to modify email: ${error.message}`,
      );
    }
  }

  async deleteEmail(
    userId: number,
    messageId: string,
    permanent: boolean = false,
  ): Promise<void> {
    try {
      const gmail = await this.createGmailClient(userId);
      if (permanent) {
        await gmail.users.messages.delete({
          userId: 'me',
          id: messageId,
        });
      } else {
        await gmail.users.messages.trash({
          userId: 'me',
          id: messageId,
        });
      }
    } catch (error: any) {
      if (error.code === 401) {
        await this.getAccessToken(userId);
        await this.deleteEmail(userId, messageId, permanent);
        return;
      }
      throw new InternalServerErrorException(
        `Failed to delete email: ${error.message}`,
      );
    }
  }
}
