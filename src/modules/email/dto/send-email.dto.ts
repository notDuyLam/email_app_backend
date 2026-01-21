import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
} from 'class-validator';

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

export class SendEmailDto {
  @ApiProperty({
    description: 'Recipient email addresses',
    example: ['recipient@example.com'],
    type: [String],
  })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsNotEmpty()
  to: string[];

  @ApiProperty({ description: 'Email subject', example: 'Test Email' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    description: 'Email body (HTML or plain text)',
    example: '<p>Hello World</p>',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    description: 'CC email addresses',
    example: ['cc@example.com'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiProperty({
    description: 'BCC email addresses',
    example: ['bcc@example.com'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @ApiProperty({
    description: 'Email attachments',
    type: [AttachmentDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  attachments?: AttachmentDto[];
}
