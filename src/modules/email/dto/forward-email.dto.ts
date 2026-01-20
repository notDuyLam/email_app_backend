import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsEmail } from 'class-validator';

class AttachmentDto {
  @ApiProperty({ description: 'Filename of the attachment' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ description: 'Base64 encoded content of the attachment' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'MIME type of the attachment' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;
}

export class ForwardEmailDto {
  @ApiProperty({
    description: 'Recipient email addresses',
    example: ['recipient@example.com'],
    type: [String],
  })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsNotEmpty()
  to: string[];

  @ApiProperty({
    description: 'Forward body/message (optional - can add additional context)',
    example: '<p>FYI, please review this email</p>',
    required: false,
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiProperty({
    description: 'Email attachments',
    type: [AttachmentDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  attachments?: AttachmentDto[];
}
