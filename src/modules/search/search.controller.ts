import {
  Body,
  Controller,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SemanticSearchService } from './semantic-search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import {
  SemanticSearchDto,
  SemanticSearchResponseDto,
} from './dto/semantic-search.dto';

@ApiTags('search')
@ApiBearerAuth('JWT-auth')
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly semanticSearchService: SemanticSearchService) {}

  @Post('semantic')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Semantic search emails',
    description:
      'Search emails using semantic similarity. Finds emails conceptually related to the query, even if they don\'t contain the exact keywords. For example, searching for "money" will find emails about "invoice", "price", "salary", etc.',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
    type: SemanticSearchResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async searchSemantic(
    @CurrentUser() user: CurrentUserPayload,
    @Body() searchDto: SemanticSearchDto,
  ): Promise<SemanticSearchResponseDto> {
    const { total, items } = await this.semanticSearchService.searchSemantic(
      user.userId,
      searchDto.query,
      searchDto.page || 1,
      searchDto.limit || 20,
      {
        unreadOnly: searchDto.unreadOnly,
        sender: searchDto.sender,
        status: searchDto.status,
      },
    );

    return {
      total,
      items: items.map((item) => ({
        id: item.id,
        subject: item.subject,
        senderName: item.senderName,
        senderEmail: item.senderEmail,
        snippet: item.snippet,
        receivedAt: item.receivedAt,
        status: item.status,
        score: item.score || 0,
      })),
      page: searchDto.page || 1,
      limit: searchDto.limit || 20,
    };
  }
}
