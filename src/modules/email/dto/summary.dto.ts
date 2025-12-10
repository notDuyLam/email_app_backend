import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateSummaryDto {
  @ApiProperty({
    description: 'The email ID to generate summary for',
    example: '18c1234567890abcdef',
  })
  @IsString()
  emailId: string;
}

export class EmailSummaryResponseDto {
  @ApiProperty({
    description: 'Generated summary of the email',
  })
  summary: string;

  @ApiProperty({
    description: 'Timestamp when the summary was generated',
  })
  summarizedAt: Date;
}
