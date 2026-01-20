import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SearchService } from './search.service';
import { EmbeddingService } from './embedding.service';
import { SemanticSearchService } from './semantic-search.service';
import { SearchController } from './search.controller';
import { Email } from '../../entities/email.entity';
import { EmailVector } from '../../entities/email-vector.entity';
import embeddingConfig from '../../configs/embedding.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Email, EmailVector]),
    ConfigModule.forFeature(embeddingConfig),
  ],
  providers: [SearchService, EmbeddingService, SemanticSearchService],
  controllers: [SearchController],
  exports: [SearchService, EmbeddingService, SemanticSearchService],
})
export class SearchModule implements OnModuleInit {
  constructor(
    private readonly searchService: SearchService,
    private readonly semanticSearchService: SemanticSearchService,
  ) {}

  onModuleInit() {
    // Wire up SearchService to use SemanticSearchService for embedding generation
    // This is done in onModuleInit to avoid circular dependency issues
    this.searchService.setSemanticSearchService(this.semanticSearchService);
  }
}
