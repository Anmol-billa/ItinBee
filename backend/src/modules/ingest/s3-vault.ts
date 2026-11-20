import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env, type AppEnv } from '../../config/env.js';
import {
  defaultKmsEnvelope,
  type KmsEnvelopeService,
} from '../../security/kms-envelope.js';

export const VAULT_QUOTA_FREE_BYTES = 50 * 1024 * 1024; // 50 MB per trip free tier
export const VAULT_QUOTA_TRIP_PASS_BYTES = 1024 * 1024 * 1024; // 1 GB
export const VAULT_QUOTA_PRO_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

export function getVaultQuotaForTier(tier: 'free' | 'trip_pass' | 'pro'): number {
  if (tier === 'pro') return VAULT_QUOTA_PRO_BYTES;
  if (tier === 'trip_pass') return VAULT_QUOTA_TRIP_PASS_BYTES;
  return VAULT_QUOTA_FREE_BYTES;
}

export class VaultQuotaExceededError extends Error {
  public readonly statusCode = 413;
  constructor(message: string) {
    super(message);
    this.name = 'VaultQuotaExceededError';
  }
}

/**
 * DPDPA 2023 Mumbai Document Vault (`ap-south-1`).
 * Envelope-encrypts uploaded ticket PDFs/images via `KmsEnvelopeService` before uploading
 * to `itinbee-vault-ap-south-1` (or retaining the encrypted envelope in memory in local dev).
 */
export class MumbaiS3VaultService {
  private readonly s3Client: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly kms: KmsEnvelopeService;
  private readonly localEncryptedObjects = new Map<string, Buffer>();

  constructor(config: AppEnv = env, kms: KmsEnvelopeService = defaultKmsEnvelope) {
    this.region = config.AWS_S3_VAULT_REGION || 'ap-south-1';
    this.bucket = config.AWS_S3_VAULT_BUCKET || 'itinbee-vault-ap-south-1';
    this.kms = kms;

    if (config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: config.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        },
      });
    } else {
      this.s3Client = null;
    }
  }

  public async storeEncryptedBookingDoc(params: {
    tripId: string;
    currentBytesUsed: number;
    quotaBytes: number;
    rawBuffer: Buffer;
    mimeType: string;
  }): Promise<{ s3Key: string; encryptedSizeBytes: number }> {
    const { tripId, currentBytesUsed, quotaBytes, rawBuffer, mimeType } = params;
    if (currentBytesUsed + rawBuffer.byteLength > quotaBytes) {
      throw new VaultQuotaExceededError(
        `Trip vault quota exceeded (${currentBytesUsed + rawBuffer.byteLength} > ${quotaBytes} bytes)`
      );
    }

    const docId = crypto.randomUUID();
    const s3Key = `ap-south-1/${this.bucket}/trips/${tripId}/${docId}.enc`;
    const aad = `vault:${tripId}:${docId}`;
    const encryptedEnvelope = await this.kms.encryptBytes(rawBuffer, aad);

    if (this.s3Client) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: encryptedEnvelope,
          ContentType: 'application/octet-stream',
          Metadata: {
            'x-itinbee-orig-mime': mimeType,
            'x-itinbee-region-lock': 'ap-south-1',
          },
          ...(env.KMS_KEY_ID
            ? {
                ServerSideEncryption: 'aws:kms',
                SSEKMSKeyId: env.KMS_KEY_ID,
              }
            : {}),
        })
      );
    } else {
      this.localEncryptedObjects.set(s3Key, encryptedEnvelope);
    }

    return {
      s3Key,
      encryptedSizeBytes: rawBuffer.byteLength,
    };
  }
}

export const defaultMumbaiVault = new MumbaiS3VaultService();
