import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchService } from './search.service';
import { EmailStatus } from '../../entities/email-status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmailStatus])],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
