import crypto from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, type AppEnv } from '../../config/env.js';
import {
  defaultKmsEnvelope,
  type KmsEnvelopeService,
} from '../../security/kms-envelope.js';
import type { TripStore } from '../../store/repository.js';

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

function deriveAadFromS3Key(s3Key: string): string | null {
  const match = /\/trips\/([^/]+)\/([^/]+)\.enc$/.exec(s3Key);
  if (!match || !match[1] || !match[2]) return null;
  return `vault:${match[1]}:${match[2]}`;
}

interface LocalObjectEntry {
  encryptedEnvelope: Buffer;
  fileName: string;
  mimeType: string;
}

/**
 * DPDPA 2023 Encrypted Document Vault (Cloudflare R2 / AWS S3 `ap-south-1` + PostgreSQL fallback).
 * Envelope-encrypts uploaded ticket PDFs/images via `KmsEnvelopeService` before uploading
 * to R2/S3 when configured, or delegating to `store.putVaultBlob` (`vault_blobs` table in Postgres
 * or `LocalDevStore` map) so uploaded ticket attachments survive restarts even before R2 is set up.
 */
export class MumbaiS3VaultService {
  private readonly s3Client: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly isCustomEndpoint: boolean;
  private readonly kmsKeyId?: string;
  private readonly kms: KmsEnvelopeService;
  private readonly localEncryptedObjects = new Map<string, LocalObjectEntry>();

  constructor(config: AppEnv = env, kms: KmsEnvelopeService = defaultKmsEnvelope) {
    this.isCustomEndpoint = Boolean(config.S3_ENDPOINT?.trim());
    this.region = this.isCustomEndpoint
      ? config.AWS_REGION?.trim() || 'auto'
      : config.AWS_S3_VAULT_REGION || config.AWS_REGION || 'ap-south-1';
    this.bucket = config.AWS_S3_VAULT_BUCKET?.trim() || '';
    this.kmsKeyId = config.KMS_KEY_ID?.trim() || undefined;
    this.kms = kms;

    if (
      config.AWS_ACCESS_KEY_ID?.trim() &&
      config.AWS_SECRET_ACCESS_KEY?.trim() &&
      this.bucket
    ) {
      this.s3Client = new S3Client({
        region: this.region,
        ...(this.isCustomEndpoint
          ? {
              endpoint: config.S3_ENDPOINT!.trim(),
              forcePathStyle: true,
            }
          : {}),
        credentials: {
          accessKeyId: config.AWS_ACCESS_KEY_ID.trim(),
          secretAccessKey: config.AWS_SECRET_ACCESS_KEY.trim(),
        },
      });
    } else {
      this.s3Client = null;
    }
  }

  public isS3Configured(): boolean {
    return this.s3Client !== null;
  }

  public async storeEncryptedBookingDoc(params: {
    tripId: string;
    currentBytesUsed: number;
    quotaBytes: number;
    rawBuffer: Buffer;
    mimeType: string;
    fileName?: string;
    store?: TripStore;
  }): Promise<{ s3Key: string; encryptedSizeBytes: number }> {
    const {
      tripId,
      currentBytesUsed,
      quotaBytes,
      rawBuffer,
      mimeType,
      fileName = 'ticket.pdf',
      store,
    } = params;

    if (currentBytesUsed + rawBuffer.byteLength > quotaBytes) {
      throw new VaultQuotaExceededError(
        `Trip vault quota exceeded (${currentBytesUsed + rawBuffer.byteLength} > ${quotaBytes} bytes)`
      );
    }

    const docId = crypto.randomUUID();
    const bucketLabel = this.bucket || 'itinbee-vault-ap-south-1';
    const s3Key = `ap-south-1/${bucketLabel}/trips/${tripId}/${docId}.enc`;
    const aad = `vault:${tripId}:${docId}`;
    const encryptedEnvelope = await this.kms.encryptBytes(rawBuffer, aad);

    if (this.s3Client && this.bucket) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: encryptedEnvelope,
          ContentType: 'application/octet-stream',
          Metadata: {
            'x-itinbee-orig-mime': mimeType,
            'x-itinbee-orig-filename': encodeURIComponent(fileName),
            'x-itinbee-region-lock': 'ap-south-1',
          },
          ...(this.kmsKeyId && !this.isCustomEndpoint
            ? {
                ServerSideEncryption: 'aws:kms',
                SSEKMSKeyId: this.kmsKeyId,
              }
            : {}),
        })
      );
    } else if (store) {
      await store.putVaultBlob({
        s3Key,
        tripId,
        fileName,
        mimeType,
        sizeBytes: rawBuffer.byteLength,
        encryptedPayload: encryptedEnvelope,
      });
    } else {
      this.localEncryptedObjects.set(s3Key, {
        encryptedEnvelope,
        fileName,
        mimeType,
      });
    }

    return {
      s3Key,
      encryptedSizeBytes: rawBuffer.byteLength,
    };
  }

  public async getDecryptedDocument(
    s3Key: string,
    options?: {
      store?: TripStore;
      fallbackFileName?: string;
      fallbackMimeType?: string;
    }
  ): Promise<{ bytes: Buffer; fileName: string; mimeType: string } | null> {
    const aad = deriveAadFromS3Key(s3Key);
    if (!aad) return null;

    if (this.s3Client && this.bucket) {
      try {
        const resp = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: s3Key,
          })
        );
        if (resp.Body) {
          const byteArr = await resp.Body.transformToByteArray();
          const encryptedEnvelope = Buffer.from(byteArr);
          const bytes = await this.kms.decryptBytes(encryptedEnvelope, aad);
          const rawName = resp.Metadata?.['x-itinbee-orig-filename'];
          const fileName = rawName
            ? decodeURIComponent(rawName)
            : (options?.fallbackFileName ?? 'ticket.pdf');
          const mimeType =
            resp.Metadata?.['x-itinbee-orig-mime'] ??
            options?.fallbackMimeType ??
            'application/pdf';
          return { bytes, fileName, mimeType };
        }
      } catch {
        // Fall through to store / memory lookup if object was persisted prior to S3 setup
      }
    }

    if (options?.store) {
      const blob = await options.store.getVaultBlob(s3Key);
      if (blob) {
        const bytes = await this.kms.decryptBytes(blob.encryptedPayload, aad);
        return {
          bytes,
          fileName: blob.fileName || options.fallbackFileName || 'ticket.pdf',
          mimeType: blob.mimeType || options.fallbackMimeType || 'application/pdf',
        };
      }
    }

    const mem = this.localEncryptedObjects.get(s3Key);
    if (mem) {
      const bytes = await this.kms.decryptBytes(mem.encryptedEnvelope, aad);
      return {
        bytes,
        fileName: mem.fileName,
        mimeType: mem.mimeType,
      };
    }

    return null;
  }

  public async getPresignedDownloadUrl(
    s3Key: string,
    expiresInSeconds = 300
  ): Promise<string | null> {
    if (!this.s3Client || !this.bucket) {
      return null;
    }
    return getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      }),
      { expiresIn: expiresInSeconds }
    );
  }

  public async deleteEncryptedDocument(
    s3Key: string,
    store?: TripStore
  ): Promise<void> {
    if (this.s3Client && this.bucket) {
      await this.s3Client
        .send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: s3Key,
          })
        )
        .catch(() => {});
    }
    if (store) {
      await store.deleteVaultBlob(s3Key);
    }
    this.localEncryptedObjects.delete(s3Key);
  }
}

export const defaultMumbaiVault = new MumbaiS3VaultService();
