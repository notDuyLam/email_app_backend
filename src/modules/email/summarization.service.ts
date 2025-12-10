import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class SummarizationService {
  private readonly logger = new Logger(SummarizationService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private models: any[] = [];
  private readonly modelNames = [
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash',
  ];

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GOOGLE_AI_API_KEY');

    if (apiKey && apiKey !== 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Initialize multiple models for fallback
        this.models = this.modelNames.map(modelName => 
          this.genAI.getGenerativeModel({ model: modelName })
        );
        this.logger.log('Google AI (Gemini) initialized with multiple models for fallback');
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
    if (!this.models || this.models.length === 0) {
      return this.fallbackSummarization(emailSubject, emailBody);
    }

    const prompt = `Summarize this email in 2-3 clear, concise sentences. Focus on the main points, action items, and key information:

Subject: ${emailSubject}

Body:
${emailBody.substring(0, 2000)}${emailBody.length > 2000 ? '...' : ''}

Provide a brief, actionable summary:`;

    // Try each model in sequence until one succeeds
    for (let i = 0; i < this.models.length; i++) {
      try {
        const model = this.models[i];
        const modelName = this.modelNames[i];
        
        this.logger.log(`Attempting to generate summary with ${modelName}...`);
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text().trim();

        if (!summary) {
          this.logger.warn(`${modelName} returned empty summary, trying next model`);
          continue;
        }

        this.logger.log(`Successfully generated summary with ${modelName}`);
        return summary;
      } catch (error) {
        this.logger.warn(
          `Failed with ${this.modelNames[i]}: ${error.message}. Trying next model...`,
        );
        // Continue to next model
      }
    }

    // All models failed, use fallback
    this.logger.warn('All AI models failed, using fallback summarization');
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
