import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailController, EmailDetailController, AttachmentController } from './email.controller';
import { EmailService } from './email.service';
import { GmailModule } from '../gmail/gmail.module';
import { EmailStatus } from '../../entities/email-status.entity';

@Module({
  imports: [
    GmailModule,
    TypeOrmModule.forFeature([EmailStatus]),
  ],
  controllers: [EmailController, EmailDetailController, AttachmentController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}

