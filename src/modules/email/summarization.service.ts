import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class SummarizationService {
  private readonly logger = new Logger(SummarizationService.name);
  private apiKeys: string[] = [];
  private modelNames: string[] = [];
  private combinations: Array<{
    apiKey: string;
    modelName: string;
    genAI: GoogleGenerativeAI;
    model: any;
  }> = [];

  constructor(private configService: ConfigService) {
    const apiKeysString = this.configService.get<string>('GOOGLE_AI_API_KEY');
    const modelsString = this.configService.get<string>('GOOGLE_AI_MODEL');

    if (apiKeysString && apiKeysString !== 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      try {
        // Parse comma-separated API keys
        this.apiKeys = apiKeysString
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k);

        // Parse comma-separated model names
        this.modelNames = modelsString
          ? modelsString
              .split(',')
              .map((m) => m.trim())
              .filter((m) => m)
          : ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];

        // Create all combinations of API keys and models
        for (const apiKey of this.apiKeys) {
          for (const modelName of this.modelNames) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });
            this.combinations.push({
              apiKey: apiKey.substring(0, 20) + '...', // For logging
              modelName,
              genAI,
              model,
            });
          }
        }

        this.logger.log(
          `Google AI initialized with ${this.apiKeys.length} API keys and ${this.modelNames.length} models (${this.combinations.length} combinations)`,
        );
      } catch (error) {
        this.logger.error(`Failed to initialize Google AI: ${error.message}`);
        this.logger.warn('Summarization will use fallback method.');
      }
    } else {
      this.logger.warn(
        'GOOGLE_AI_API_KEY not configured. Summarization will use fallback method.',
      );
    }
  }

  async summarizeEmail(
    emailSubject: string,
    emailBody: string,
  ): Promise<string> {
    // Strip HTML tags from email body before processing
    const cleanBody = this.stripHtmlTags(emailBody);

    // If Google AI is not configured, use fallback summarization
    if (!this.combinations || this.combinations.length === 0) {
      return this.fallbackSummarization(emailSubject, cleanBody);
    }

    // Increase limit to 4000 characters for better context
    const bodyContent = cleanBody.substring(0, 4000);

    const prompt = `Summarize this email in 2-3 clear, complete sentences. Focus on the main points, action items, and key information. Do NOT end your summary with "..." - always provide a complete summary.

Subject: ${emailSubject}

Body:
${bodyContent}

Provide a complete, actionable summary (do not truncate):`;

    // Try each combination (apiKey + model) until one succeeds
    for (let i = 0; i < this.combinations.length; i++) {
      const combo = this.combinations[i];

      try {
        this.logger.log(
          `Attempting summary with API key ${combo.apiKey} and model ${combo.modelName}...`,
        );

        const result = await combo.model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text().trim();

        if (!summary) {
          this.logger.warn(
            `${combo.modelName} with key ${combo.apiKey} returned empty summary, trying next combination`,
          );
          continue;
        }

        this.logger.log(
          `✓ Successfully generated summary with ${combo.modelName} using key ${combo.apiKey}`,
        );
        return summary;
      } catch (error) {
        this.logger.warn(
          `✗ Failed with ${combo.modelName} and key ${combo.apiKey}: ${error.message}`,
        );
        // Continue to next combination
      }
    }

    // All combinations failed, use fallback
    this.logger.warn(
      `All ${this.combinations.length} API key/model combinations failed, using fallback summarization`,
    );
    return this.fallbackSummarization(emailSubject, emailBody);
  }

  private fallbackSummarization(
    emailSubject: string,
    emailBody: string,
  ): Promise<string> {
    // Simple extractive summarization as fallback
    const sentences = emailBody
      .replace(/\n+/g, ' ')
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 20)
      .slice(0, 3); // Take up to 3 sentences

    let summary = sentences.join('. ').trim();

    // Add period at the end if missing
    if (summary && !summary.endsWith('.')) {
      summary += '.';
    }

    // Increase limit to 500 characters
    if (summary.length > 500) {
      // Find the last complete sentence within limit
      const truncated = summary.substring(0, 500);
      const lastPeriod = truncated.lastIndexOf('.');
      if (lastPeriod > 200) {
        summary = truncated.substring(0, lastPeriod + 1);
      } else {
        summary = truncated.trim() + '...';
      }
    }

    if (!summary) {
      summary = `Email về: ${emailSubject}`;
    }

    return Promise.resolve(summary);
  }

  /**
   * Strip HTML tags from text to get plain text content
   */
  private stripHtmlTags(html: string | undefined | null): string {
    if (!html) return '';
    let text = html;
    // Remove DOCTYPE
    text = text.replace(/<!DOCTYPE[\s\S]*?>/gi, ' ');
    // Remove head section entirely
    text = text.replace(/<head[\s\S]*?<\/head>/gi, ' ');
    // Remove script tags
    text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    // Remove style tags
    text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    // Replace common block elements with newlines for better readability
    text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    // Decode HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }
}
