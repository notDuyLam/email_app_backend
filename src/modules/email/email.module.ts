import { Module } from '@nestjs/common';
import { EmailController, EmailDetailController } from './email.controller';
import { EmailService } from './email.service';

@Module({
  controllers: [EmailController, EmailDetailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}

