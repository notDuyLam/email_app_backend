export class EmailListItemDto {
  id: string;
  senderName: string;
  subject: string;
  preview: string;
  timestamp: Date;
  isStarred: boolean;
  isRead: boolean;
}

export class EmailListResponseDto {
  emails: EmailListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

