import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Res,
  ParseBoolPipe,
} from '@nestjs/common';
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { SendEmailDto } from './dto/send-email.dto';
import { ReplyEmailDto } from './dto/reply-email.dto';
import { ModifyEmailDto } from './dto/modify-email.dto';

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
  ) {
    return this.emailService.getEmailsByMailbox(user.userId, mailboxId, page, pageSize);
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
  @ApiParam({ name: 'id', description: 'Email ID', example: '18c1234567890abcdef' })
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
  @ApiParam({ name: 'id', description: 'Email ID to reply to', example: '18c1234567890abcdef' })
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
  @ApiParam({ name: 'id', description: 'Email ID', example: '18c1234567890abcdef' })
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

  @Post(':id/delete')
  @ApiOperation({ summary: 'Delete an email (move to trash or permanently delete)' })
  @ApiParam({ name: 'id', description: 'Email ID', example: '18c1234567890abcdef' })
  @ApiQuery({ name: 'permanent', required: false, type: Boolean, example: false })
  @ApiResponse({
    status: 200,
    description: 'Email deleted successfully',
  })
  async deleteEmail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') emailId: string,
    @Query('permanent', new DefaultValuePipe(false), ParseBoolPipe) permanent: boolean,
  ) {
    await this.emailService.deleteEmail(user.userId, emailId, permanent);
    return { message: 'Email deleted successfully' };
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
  @ApiParam({ name: 'messageId', description: 'Message ID', example: '18c1234567890abcdef' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment ID', example: 'attachmentId123' })
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
    const attachment = await this.emailService.getAttachment(user.userId, messageId, attachmentId);
    
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
    res.send(attachment.data);
  }
}
