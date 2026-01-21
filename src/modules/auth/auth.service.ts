import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import type { StringValue } from 'ms';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../../entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { GmailService } from '../gmail/gmail.service';
import { KanbanService } from '../kanban/kanban.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private refreshTokenPromises: Map<string, Promise<{ accessToken: string }>> =
    new Map();
  private googleClient: OAuth2Client;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private gmailService: GmailService,
    private kanbanService: KanbanService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create new user
    const newUser = this.userRepository.create({
      email: registerDto.email,
      password: hashedPassword,
      name: registerDto.name || null,
    });

    const savedUser = await this.userRepository.save(newUser);

    // Create default kanban columns for new user
    await this.kanbanService.createDefaultColumnsForUser(savedUser.id);

    // Generate tokens
    return this.generateTokens(savedUser);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  async refreshToken(
    refreshTokenDto: RefreshTokenDto,
  ): Promise<{ accessToken: string }> {
    const { refreshToken } = refreshTokenDto;

    // Check if there's already a refresh in progress for this token
    if (this.refreshTokenPromises.has(refreshToken)) {
      return this.refreshTokenPromises.get(refreshToken)!;
    }

    const refreshPromise = this.validateAndRefreshToken(refreshToken);
    this.refreshTokenPromises.set(refreshToken, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      this.refreshTokenPromises.delete(refreshToken);
    }
  }

  private async validateAndRefreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    try {
      const refreshSecret = this.configService.get<string>('jwt.refreshSecret');
      const payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      // Verify user still exists
      const user = await this.userRepository.findOne({
        where: { id: payload.userId },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private generateTokens(user: User): AuthResponseDto {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
      },
    };
  }

  private generateAccessToken(user: User): string {
    const payload: CurrentUserPayload = {
      userId: user.id,
      email: user.email,
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>(
        'jwt.accessExpiresIn',
      ) as StringValue,
    });
  }

  private generateRefreshToken(user: User): string {
    const payload = {
      userId: user.id,
      email: user.email,
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>(
        'jwt.refreshExpiresIn',
      ) as StringValue,
    });
  }

  async validateUser(userId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async googleLogin(googleLoginDto: GoogleLoginDto): Promise<AuthResponseDto> {
    try {
      // Verify Google token
      const ticket = await this.googleClient.verifyIdToken({
        idToken: googleLoginDto.token,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid Google token');
      }

      const { sub: googleId, email, name } = payload;

      // Find or create user
      let user = await this.userRepository.findOne({
        where: [{ googleId }, { email }],
      });

      if (user) {
        // Update Google info if not set
        if (!user.googleId) {
          user.googleId = googleId;
          await this.userRepository.save(user);
        }
      } else {
        // Create new user from Google account
        user = this.userRepository.create({
          email,
          name: name || '',
          googleId,
          password: null,
        });
        await this.userRepository.save(user);

        // Create default kanban columns for new user
        await this.kanbanService.createDefaultColumnsForUser(user.id);
      }

      return this.generateTokens(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException('Google authentication failed');
    }
  }

  async getGmailAuthUrl(): Promise<string> {
    return this.gmailService.getAuthUrl();
  }

  async handleGmailCallback(
    code: string | undefined,
    error: string | undefined,
    res: Response,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('gmail.frontendUrl') ||
      'http://localhost:5173';

    if (error) {
      res.redirect(`${frontendUrl}/login?error=access_denied`);
      return;
    }

    if (!code) {
      res.redirect(`${frontendUrl}/login?error=no_code`);
      return;
    }

    try {
      const { refreshToken, accessToken, expiryDate, userInfo } =
        await this.gmailService.handleCallback(code);

      let user = await this.userRepository.findOne({
        where: { email: userInfo.email },
      });

      if (!user) {
        user = this.userRepository.create({
          email: userInfo.email,
          name: userInfo.name || '',
          googleId: userInfo.sub,
          password: null,
        });
        await this.userRepository.save(user);

        // Create default kanban columns for new user
        await this.kanbanService.createDefaultColumnsForUser(user.id);
      } else {
        if (!user.googleId) {
          user.googleId = userInfo.sub;
          await this.userRepository.save(user);
        }
      }

      await this.gmailService.saveToken(
        user.id,
        refreshToken,
        accessToken,
        expiryDate,
      );

      // Generate app session tokens
      const { accessToken: appAccessToken, refreshToken: appRefreshToken } =
        this.generateTokens(user);

      this.logger.log('Redirecting to frontend with tokens...');
      // Redirect to frontend with tokens
      res.redirect(
        `${frontendUrl}/auth/callback?accessToken=${appAccessToken}&refreshToken=${appRefreshToken}`,
      );
    } catch (error) {
      this.logger.error('Failed to handle Gmail callback:', error.message);
      this.logger.error(error.stack);
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  async hasGmailConnected(userId: number): Promise<boolean> {
    const token = await this.gmailService.getStoredToken(userId);
    return token !== null && token.isActive;
  }

  async logout(userId: number): Promise<void> {
    const hasGmail = await this.hasGmailConnected(userId);
    if (hasGmail) {
      await this.gmailService.revokeToken(userId);
    }
  }
}
