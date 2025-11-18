import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

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
  async getMailboxes() {
    return this.emailService.getMailboxes();
  }

  @Get(':id/emails')
  @ApiOperation({ summary: 'Get emails by mailbox ID' })
  @ApiParam({ name: 'id', description: 'Mailbox ID', example: 'inbox' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Emails retrieved successfully',
  })
  async getEmailsByMailbox(
    @Param('id') mailboxId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe)
    pageSize: number,
  ) {
    return this.emailService.getEmailsByMailbox(mailboxId, page, pageSize);
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
  @ApiParam({ name: 'id', description: 'Email ID', example: '123' })
  @ApiResponse({
    status: 200,
    description: 'Email retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async getEmailById(@Param('id') emailId: string) {
    return this.emailService.getEmailById(emailId);
  }
}

