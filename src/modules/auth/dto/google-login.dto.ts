import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token from Google Sign-In',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
