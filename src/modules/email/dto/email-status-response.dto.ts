import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class EmailStatusResponseDto {
  @ApiProperty({
    description: 'Email ID (Gmail message ID)',
    example: '18c1234567890abcdef',
  })
  emailId: string;

  @ApiProperty({
    description: 'Kanban column name',
    example: 'To Do',
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Kanban column ID',
    example: 2,
  })
  kanbanColumnId?: number | null;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  updatedAt: Date;
}

export class BulkEmailStatusRequestDto {
  @ApiProperty({
    description: 'Array of email IDs to get statuses for',
    type: [String],
    example: ['18c1234567890abcdef', '18c9876543210fedcba'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  emailIds: string[];
}
