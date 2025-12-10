import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class SummarizationService {
  private readonly logger = new Logger(SummarizationService.name);
  private apiKeys: string[] = [];
  private modelNames: string[] = [];
  private combinations: Array<{ apiKey: string; modelName: string; genAI: GoogleGenerativeAI; model: any }> = [];

  constructor(private configService: ConfigService) {
    const apiKeysString = this.configService.get<string>('GOOGLE_AI_API_KEY');
    const modelsString = this.configService.get<string>('GOOGLE_AI_MODEL');

    if (apiKeysString && apiKeysString !== 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      try {
        // Parse comma-separated API keys
        this.apiKeys = apiKeysString.split(',').map(k => k.trim()).filter(k => k);
        
        // Parse comma-separated model names
        this.modelNames = modelsString 
          ? modelsString.split(',').map(m => m.trim()).filter(m => m)
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
    // If Google AI is not configured, use fallback summarization
    if (!this.combinations || this.combinations.length === 0) {
      return this.fallbackSummarization(emailSubject, emailBody);
    }

    const prompt = `Summarize this email in 2-3 clear, concise sentences. Focus on the main points, action items, and key information:

Subject: ${emailSubject}

Body:
${emailBody.substring(0, 2000)}${emailBody.length > 2000 ? '...' : ''}

Provide a brief, actionable summary:`;

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
