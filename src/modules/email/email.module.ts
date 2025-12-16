import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EmailController,
  EmailDetailController,
  AttachmentController,
  SnoozeController,
  SummaryController,
} from './email.controller';
import { EmailService } from './email.service';
import { SummarizationService } from './summarization.service';
import { GmailModule } from '../gmail/gmail.module';
import { EmailStatus } from '../../entities/email-status.entity';
import { ElasticsearchModule } from '../search/elasticsearch.module';

@Module({
  imports: [GmailModule, TypeOrmModule.forFeature([EmailStatus]), ElasticsearchModule],
  // IMPORTANT: Controllers with static routes (SnoozeController, SummaryController) must be registered
  // BEFORE controllers with parameterized routes (EmailDetailController) to avoid route conflicts
  controllers: [
    EmailController,
    SnoozeController,
    SummaryController,
    AttachmentController,
    EmailDetailController,
  ],
  providers: [EmailService, SummarizationService],
  exports: [EmailService],
})
export class EmailModule {}

