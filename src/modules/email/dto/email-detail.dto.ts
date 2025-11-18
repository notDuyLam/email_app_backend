export class EmailDetailDto {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  receivedDate: Date;
  body: string;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
  }>;
  isStarred: boolean;
  isRead: boolean;
}

