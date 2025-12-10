import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class SummarizationService {
  private readonly logger = new Logger(SummarizationService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GOOGLE_AI_API_KEY');

    if (apiKey && apiKey !== 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        this.logger.log('Google AI (Gemini) initialized successfully');
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
    // If Google AI is not configured, use fallback summarization
    if (!this.model) {
      return this.fallbackSummarization(emailSubject, emailBody);
    }

    try {
      const prompt = `Summarize this email in 2-3 clear, concise sentences. Focus on the main points, action items, and key information:

Subject: ${emailSubject}

Body:
${emailBody.substring(0, 2000)}${emailBody.length > 2000 ? '...' : ''}

Provide a brief, actionable summary:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const summary = response.text().trim();

      if (!summary) {
        this.logger.warn('Google AI returned empty summary, using fallback');
        return this.fallbackSummarization(emailSubject, emailBody);
      }

      return summary;
    } catch (error) {
      this.logger.error(
        `Failed to generate summary with Google AI: ${error.message}`,
      );
      return this.fallbackSummarization(emailSubject, emailBody);
    }
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
      .slice(0, 2);

    let summary = sentences.join('. ').trim();

    if (summary.length > 200) {
      summary = summary.substring(0, 197) + '...';
    }

    if (!summary) {
      summary = `Email regarding: ${emailSubject}`;
    }

    return Promise.resolve(summary);
  }
}
