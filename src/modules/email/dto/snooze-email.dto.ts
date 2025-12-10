import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SnoozeEmailDto {
  @ApiProperty({
    description: 'ISO 8601 date string for when the email should be unsnoozed',
    example: '2025-12-11T10:00:00Z',
  })
  @IsDateString()
  snoozeUntil: string;
}

export class GetSnoozedEmailsResponseDto {
  @ApiProperty({
    description: 'List of snoozed emails with full details',
    type: 'array',
  })
  emails: any[];
}
