import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, MaxLength } from 'class-validator';

export class UpdateEmailStatusDto {
  @ApiProperty({
    description: 'Kanban column name or ID',
    example: 'To Do',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  status: string;

  @ApiPropertyOptional({
    description: 'Kanban column ID (alternative to status name)',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  kanbanColumnId?: number;

  @ApiPropertyOptional({
    description: 'Gmail label ID to sync (optional)',
    example: 'STARRED',
  })
  @IsOptional()
  @IsString()
  gmailLabelId?: string;

  @ApiPropertyOptional({
    description: 'Previous Gmail label ID to remove (optional)',
    example: 'INBOX',
  })
  @IsOptional()
  @IsString()
  oldGmailLabelId?: string;
}
