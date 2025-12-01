import { Module } from '@nestjs/common';
import { EmailController, EmailDetailController, AttachmentController } from './email.controller';
import { EmailService } from './email.service';
import { GmailModule } from '../gmail/gmail.module';

@Module({
  imports: [GmailModule],
  controllers: [EmailController, EmailDetailController, AttachmentController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}

