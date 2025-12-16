import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

export interface EmailSearchDocument {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet?: string;
  receivedAt?: string;
  status?: string;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client;
  private emailIndex: string;

  constructor(private readonly configService: ConfigService) {
    const node =
      this.configService.get<string>('elasticsearch.node') ||
      process.env.ELASTICSEARCH_NODE ||
      'http://localhost:9200';

    const username =
      this.configService.get<string>('elasticsearch.username') || '';
    const password =
      this.configService.get<string>('elasticsearch.password') || '';

    this.emailIndex =
      this.configService.get<string>('elasticsearch.emailIndex') ||
      process.env.ELASTICSEARCH_INDEX_EMAIL ||
      'email_index';

    this.client = new Client({
      node,
      auth:
        username && password
          ? {
              username,
              password,
            }
          : undefined,
    });
  }

  async onModuleInit() {
    await this.ensureEmailIndex();
  }

  private async ensureEmailIndex() {
    const exists = await this.client.indices.exists({ index: this.emailIndex });
    if (exists) {
      this.logger.log(
        `Elasticsearch index "${this.emailIndex}" already exists`,
      );
      return;
    }

    this.logger.log(`Creating Elasticsearch index "${this.emailIndex}"...`);
    await (this.client.indices as any).create({
      index: this.emailIndex,
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            subject: { type: 'text' },
            senderName: { type: 'text' },
            senderEmail: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' },
              },
            },
            snippet: { type: 'text' },
            receivedAt: { type: 'date' },
            status: { type: 'keyword' },
          },
        },
      },
    } as any);
    this.logger.log(`Elasticsearch index "${this.emailIndex}" created`);
  }

  async indexEmail(doc: EmailSearchDocument) {
    await this.client.index({
      index: this.emailIndex,
      id: doc.id,
      document: doc,
      refresh: 'true',
    });
  }

  async bulkIndexEmails(docs: EmailSearchDocument[]) {
    if (!docs.length) return;

    const operations = docs.flatMap((doc) => [
      { index: { _index: this.emailIndex, _id: doc.id } },
      doc,
    ]);

    await this.client.bulk({
      refresh: 'true',
      operations,
    });
  }

  async searchEmails(query: string, page = 1, limit = 20) {
    const from = (page - 1) * limit;

    const result = await (this.client as any).search({
      index: this.emailIndex,
      from,
      size: limit,
      body: {
        query: {
          multi_match: {
            query,
            fields: ['subject^3', 'senderName^2', 'senderEmail^2', 'snippet'],
            fuzziness: 'AUTO',
            operator: 'and',
          },
        },
      },
    });

    const hits = result.hits.hits;

    return {
      total: (result.hits.total as any)?.value ?? hits.length,
      items: hits.map((hit) => ({
        score: hit._score,
        ...(hit._source as EmailSearchDocument),
      })),
    };
  }
}


