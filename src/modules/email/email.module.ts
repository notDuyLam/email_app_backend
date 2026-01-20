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
import { Email } from '../../entities/email.entity';
import { SnoozeSchedule } from '../../entities/snooze-schedule.entity';
import { KanbanColumn } from '../../entities/kanban-column.entity';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    GmailModule,
    TypeOrmModule.forFeature([Email, SnoozeSchedule, KanbanColumn]),
    SearchModule,
  ],
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
