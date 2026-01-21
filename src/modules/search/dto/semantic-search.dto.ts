import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SemanticSearchDto {
  @ApiProperty({
    description: 'Search query text',
    example: 'money invoice payment',
  })
  @IsString()
  query: string;

  @ApiPropertyOptional({
    description: 'Page number (default: 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of results per page (default: 20)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter: unread emails only',
    example: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Filter: sender email or name',
    example: 'john@example.com',
  })
  @IsOptional()
  @IsString()
  sender?: string;

  @ApiPropertyOptional({
    description:
      'Filter: email status (inbox, todo, in-progress, done, snoozed)',
    example: 'inbox',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class SemanticSearchResultItemDto {
  @ApiProperty({ description: 'Email ID', example: '1234567890' })
  id: string;

  @ApiProperty({ description: 'Email subject', example: 'Invoice #12345' })
  subject: string;

  @ApiProperty({ description: 'Sender name', example: 'John Doe' })
  senderName: string;

  @ApiProperty({ description: 'Sender email', example: 'john@example.com' })
  senderEmail: string;

  @ApiPropertyOptional({
    description: 'Email snippet/preview',
    example: 'This is a preview of the email content...',
  })
  snippet?: string;

  @ApiPropertyOptional({
    description: 'Received date (ISO string)',
    example: '2024-01-15T10:30:00Z',
  })
  receivedAt?: string;

  @ApiPropertyOptional({
    description: 'Email status',
    example: 'inbox',
  })
  status?: string;

  @ApiProperty({
    description: 'Semantic similarity score (0-1, higher is more relevant)',
    example: 0.85,
  })
  score: number;
}

export class SemanticSearchResponseDto {
  @ApiProperty({ description: 'Total number of results', example: 42 })
  total: number;

  @ApiProperty({
    description: 'Search results',
    type: [SemanticSearchResultItemDto],
  })
  items: SemanticSearchResultItemDto[];

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Number of results per page', example: 20 })
  limit: number;
}
