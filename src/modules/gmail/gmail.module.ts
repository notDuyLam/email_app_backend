import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GmailService } from './gmail.service';
import { GmailToken } from '../../entities/gmail-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GmailToken])],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}
