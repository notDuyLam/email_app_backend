import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { EmailService } from './email.service';
import { SummarizationService } from './summarization.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';
import { UpdateEmailStatusDto } from './dto/update-email-status.dto';
import { BulkEmailStatusRequestDto } from './dto/email-status-response.dto';
import {
  SnoozeEmailDto,
  GetSnoozedEmailsResponseDto,
} from './dto/snooze-email.dto';
import { EmailSummaryResponseDto } from './dto/summary.dto';
import { EmailSearchQueryDto } from './dto/email-search-query.dto';

@ApiTags('mailboxes')
@ApiBearerAuth('JWT-auth')
@Controller('mailboxes')
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  @ApiOperation({ summary: 'Get all mailboxes' })
  @ApiResponse({
    status: 200,
    description: 'List of mailboxes retrieved successfully',
  })
  async getMailboxes(@CurrentUser() user: CurrentUserPayload) {
    return this.emailService.getMailboxes(user.userId);
  }

  @Get(':id/emails')
  @ApiOperation({ summary: 'Get emails by mailbox ID' })
  @ApiParam({ name: 'id', description: 'Mailbox ID', example: 'INBOX' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'important meeting',
  })
  @ApiQuery({ name: 'pageToken', required: false, type: String, example: '' })
  @ApiResponse({
    status: 200,
    description: 'Emails retrieved successfully',
  })
  async getEmailsByMailbox(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') mailboxId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe)
    pageSize: number,
    @Query('search') search?: string,
    @Query('pageToken') pageToken?: string,
  ) {
    return this.emailService.getEmailsByMailbox(
      user.userId,
      mailboxId,
      page,
      pageSize,
      search,
      pageToken,
    );
  }

  @Get('search')
  @ApiTags('email-search')
  @ApiOperation({ summary: 'Fuzzy search emails by subject and sender' })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search query (supports typos and partial matches)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
  })
  async searchEmails(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: EmailSearchQueryDto,
  ) {
    return this.emailService.searchEmailsFuzzy(
      user.userId,
      query.q,
      query.page,
      query.limit,
    );
  }
}

@ApiTags('emails')
@ApiBearerAuth('JWT-auth')
@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailDetailController {
  constructor(private readonly emailService: EmailService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get email by ID' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiResponse({
    status: 200,
    description: 'Email retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async getEmailById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
  ) {
    return this.emailService.getEmailById(user.userId, emailId);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a new email' })
  @ApiBody({ type: SendEmailDto })
  @ApiResponse({
    status: 201,
    description: 'Email sent successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        threadId: { type: 'string' },
      },
    },
  })
  async sendEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Body() sendEmailDto: SendEmailDto,
  ) {
    return this.emailService.sendEmail(user.userId, sendEmailDto);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Reply to an email' })
  @ApiParam({
    name: 'id',
    description: 'Email ID to reply to',
    example: '18c1234567890abcdef',
  })
  @ApiBody({ type: ReplyEmailDto })
  @ApiResponse({
    status: 201,
    description: 'Reply sent successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        threadId: { type: 'string' },
      },
    },
  })
  async replyEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
    @Body() replyDto: ReplyEmailDto,
  ) {
    return this.emailService.replyEmail(user.userId, emailId, replyDto);
  }

  @Post(':id/modify')
  @ApiOperation({ summary: 'Modify email (mark read/unread, star, etc.)' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiBody({ type: ModifyEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Email modified successfully',
  })
  async modifyEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
    @Body() modifyDto: ModifyEmailDto,
  ) {
    await this.emailService.modifyEmail(user.userId, emailId, modifyDto);
    return { message: 'Email modified successfully' };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark email as read' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiResponse({
    status: 200,
    description: 'Email marked as read successfully',
  })
  async markAsRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
  ) {
    await this.emailService.markAsRead(user.userId, emailId);
    return { message: 'Email marked as read successfully' };
  }

  @Post(':id/unread')
  @ApiOperation({ summary: 'Mark email as unread' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiResponse({
    status: 200,
    description: 'Email marked as unread successfully',
  })
  async markAsUnread(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
  ) {
    await this.emailService.markAsUnread(user.userId, emailId);
    return { message: 'Email marked as unread successfully' };
  }

  @Post('bulk-status')
  @ApiOperation({ summary: 'Get kanban statuses for multiple emails' })
  @ApiBody({ type: BulkEmailStatusRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Email statuses retrieved successfully',
  })
  async getBulkEmailStatuses(
    @CurrentUser() user: CurrentUserPayload,
    @Body() bulkRequest: BulkEmailStatusRequestDto,
  ) {
    return this.emailService.getBulkEmailStatuses(
      user.userId,
      bulkRequest.emailIds,
    );
  }

  @Post(':id/delete')
  @ApiOperation({
    summary: 'Delete an email (move to trash or permanently delete)',
  })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiQuery({
    name: 'permanent',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Email deleted successfully',
  })
  async deleteEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
    @Query('permanent', new DefaultValuePipe(false), ParseBoolPipe)
    permanent: boolean,
  ) {
    await this.emailService.deleteEmail(user.userId, emailId, permanent);
    return { message: 'Email deleted successfully' };
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get email kanban status' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiResponse({
    status: 200,
    description: 'Email status retrieved successfully',
  })
  async getEmailStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
  ) {
    return this.emailService.getEmailStatus(user.userId, emailId);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update email kanban status' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiBody({ type: UpdateEmailStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Email status updated successfully',
  })
  async updateEmailStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
    @Body() updateDto: UpdateEmailStatusDto,
  ) {
    return this.emailService.updateEmailStatus(
      user.userId,
      emailId,
      updateDto.status,
    );
  }
}

@ApiTags('attachments')
@ApiBearerAuth('JWT-auth')
@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(private readonly emailService: EmailService) {}

  @Get(':messageId/:attachmentId')
  @ApiOperation({ summary: 'Download an email attachment' })
  @ApiParam({
    name: 'messageId',
    description: 'Message ID',
    example: '18c1234567890abcdef',
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'Attachment ID',
    example: 'attachmentId123',
  })
  @ApiResponse({
    status: 200,
    description: 'Attachment downloaded successfully',
  })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async getAttachment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const attachment = await this.emailService.getAttachment(
      user.userId,
      messageId,
      attachmentId,
    );

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.filename}"`,
    );
    res.send(attachment.data);
  }
}

@ApiTags('email-snooze')
@ApiBearerAuth('JWT-auth')
@Controller('emails')
@UseGuards(JwtAuthGuard)
export class SnoozeController {
  private readonly logger = new Logger(SnoozeController.name);

  constructor(private readonly emailService: EmailService) {}

  // IMPORTANT: Static routes must come before parameterized routes
  @Get('snoozed')
  @ApiOperation({ summary: 'Get all snoozed emails' })
  @ApiResponse({
    status: 200,
    description: 'Snoozed emails retrieved successfully',
    type: GetSnoozedEmailsResponseDto,
  })
  async getSnoozedEmails(@CurrentUser() user: CurrentUserPayload) {
    this.logger.log(
      `[API_GET_SNOOZED] User ${user.userId} requesting snoozed emails`,
    );

    const result = await this.emailService.getSnoozedEmails(user.userId);

    this.logger.log(
      `[API_GET_SNOOZED] Returning ${result.length} snoozed emails for user ${user.userId}`,
    );
    return result;
  }

  @Post('check-expired-snoozes')
  @ApiOperation({ summary: 'Check and restore expired snoozed emails' })
  @ApiResponse({
    status: 200,
    description: 'Expired snoozes checked and restored',
  })
  async checkExpiredSnoozes(@CurrentUser() user: CurrentUserPayload) {
    this.logger.log(
      `[API_CHECK_EXPIRED] User ${user.userId} requesting expired snooze check`,
    );

    const restoredEmailIds = await this.emailService.checkExpiredSnoozes(
      user.userId,
    );

    this.logger.log(
      `[API_CHECK_EXPIRED] Restored ${restoredEmailIds.length} expired snoozes for user ${user.userId}`,
    );
    return {
      message: 'Expired snoozes checked',
      restoredCount: restoredEmailIds.length,
      restoredEmailIds,
    };
  }

  @Post(':id/snooze')
  @ApiOperation({ summary: 'Snooze an email until a specific time' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiBody({ type: SnoozeEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Email snoozed successfully',
  })
  async snoozeEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
    @Body() snoozeDto: SnoozeEmailDto,
  ) {
    const snoozeUntil = new Date(snoozeDto.snoozeUntil);
    this.logger.log(
      `[API_SNOOZE] User ${user.userId} requesting to snooze email ${emailId} until ${snoozeUntil.toISOString()}`,
    );

    await this.emailService.snoozeEmail(user.userId, emailId, snoozeUntil);

    this.logger.log(
      `[API_SNOOZE] Successfully processed snooze request for email ${emailId}`,
    );
    return { message: 'Email snoozed successfully', snoozeUntil };
  }

  @Post(':id/unsnooze')
  @ApiOperation({ summary: 'Unsnooze an email (return to inbox)' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiResponse({
    status: 200,
    description: 'Email unsnoozed successfully',
  })
  async unsnoozeEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
  ) {
    this.logger.log(
      `[API_UNSNOOZE] User ${user.userId} requesting to unsnooze email ${emailId}`,
    );

    await this.emailService.unsnoozeEmail(user.userId, emailId);

    this.logger.log(
      `[API_UNSNOOZE] Successfully processed unsnooze request for email ${emailId}`,
    );
    return { message: 'Email unsnoozed successfully' };
  }
}

@ApiTags('email-summary')
@ApiBearerAuth('JWT-auth')
@Controller('emails')
@UseGuards(JwtAuthGuard)
export class SummaryController {
  constructor(
    private readonly emailService: EmailService,
    private readonly summarizationService: SummarizationService,
  ) {}

  @Post(':id/summarize')
  @ApiOperation({ summary: 'Generate or retrieve summary for an email' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'Force regenerate summary even if one exists',
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Email summary generated successfully',
    type: EmailSummaryResponseDto,
  })
  async summarizeEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
    @Query('force', new DefaultValuePipe(false), ParseBoolPipe) force?: boolean,
  ) {
    // Check if summary already exists and not forcing regeneration
    if (!force) {
      const existingSummary = await this.emailService.getEmailSummary(
        user.userId,
        emailId,
      );

      if (existingSummary) {
        const emailStatus = await this.emailService[
          'emailStatusRepository'
        ].findOne({
          where: { userId: user.userId, emailId },
        });

        return {
          summary: existingSummary,
          summarizedAt: emailStatus?.summarizedAt || new Date(),
          cached: true,
        };
      }
    }

    // Fetch email content
    const email = await this.emailService.getEmailById(user.userId, emailId);

    // Generate summary
    const summary = await this.summarizationService.summarizeEmail(
      email.subject || '',
      email.body || '',
    );

    // Save summary
    await this.emailService.saveEmailSummary(user.userId, emailId, summary);

    return {
      summary,
      summarizedAt: new Date(),
      cached: false,
    };
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Get existing summary for an email' })
  @ApiParam({
    name: 'id',
    description: 'Email ID',
    example: '18c1234567890abcdef',
  })
  @ApiResponse({
    status: 200,
    description: 'Email summary retrieved successfully',
    type: EmailSummaryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Summary not found' })
  async getEmailSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
  ) {
    const summary = await this.emailService.getEmailSummary(
      user.userId,
      emailId,
    );

    if (!summary) {
      return { summary: null, summarizedAt: null };
    }

    const emailStatus = await this.emailService[
      'emailStatusRepository'
    ].findOne({
      where: { userId: user.userId, emailId },
    });

    return {
      summary,
      summarizedAt: emailStatus?.summarizedAt || new Date(),
    };
  }
}
