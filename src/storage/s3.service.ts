import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

export interface StoredObject {
  body: Readable;
  contentLength?: number;
  contentType?: string;
  contentRange?: string;
}

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const rawEndpoint = config.get<string>('MINIO_ENDPOINT') ?? 'minio';
    const port = config.get<string>('MINIO_PORT') ?? '9000';
    const useSsl = (config.get<string>('MINIO_USE_SSL') ?? 'false') === 'true';
    const endpoint = rawEndpoint.startsWith('http')
      ? rawEndpoint
      : `${useSsl ? 'https' : 'http'}://${rawEndpoint}:${port}`;

    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'privis-documents';

    this.client = new S3Client({
      region: config.get<string>('MINIO_REGION') ?? 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId:
          config.get<string>('MINIO_ROOT_USER') ??
          config.get<string>('MINIO_ACCESS_KEY') ??
          'minioadmin',
        secretAccessKey:
          config.get<string>('MINIO_ROOT_PASSWORD') ??
          config.get<string>('MINIO_SECRET_KEY') ??
          'minioadmin',
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Bucket '${this.bucket}' dibuat.`);
      } else {
        this.logger.warn(
          `Tidak dapat memeriksa bucket '${this.bucket}': ${String(error)}`,
        );
      }
    }
  }

  async upload(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async download(key: string, range?: string): Promise<StoredObject> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range,
      }),
    );

    return {
      body: response.Body as Readable,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      contentRange: response.ContentRange,
    };
  }

  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
