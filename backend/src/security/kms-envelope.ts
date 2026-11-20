import crypto from 'node:crypto';
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import { env, type AppEnv } from '../config/env.js';

export interface EnvelopePayloadV1 {
  v: 1;
  mode: 'kms' | 'local';
  region: string;
  wrappedDekB64: string;
  ivB64: string;
  tagB64: string;
  ciphertextB64: string;
}

/**
 * Envelope Encryption Service (DPDPA 2023 PII Vault).
 * Uses random 256-bit AES-GCM Data Encryption Keys (DEK) per payload.
 * When AWS KMS credentials & KMS_KEY_ID are configured, wraps DEKs in AWS ap-south-1 (Mumbai).
 * Otherwise uses a deterministic local master key so local dev and tests run with zero cloud dependencies.
 */
export class KmsEnvelopeService {
  private readonly kmsClient: KMSClient | null;
  private readonly kmsKeyId: string | undefined;
  private readonly region: string;
  private readonly localMasterKey: Buffer;

  constructor(config: AppEnv = env) {
    this.region = config.AWS_S3_VAULT_REGION || 'ap-south-1';
    this.kmsKeyId = config.KMS_KEY_ID || undefined;

    if (
      this.kmsKeyId &&
      config.AWS_ACCESS_KEY_ID &&
      config.AWS_SECRET_ACCESS_KEY
    ) {
      this.kmsClient = new KMSClient({
        region: this.region,
        credentials: {
          accessKeyId: config.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        },
      });
    } else {
      this.kmsClient = null;
    }

    if (
      config.DEV_MASTER_KEY_HEX &&
      /^[0-9a-fA-F]{64}$/.test(config.DEV_MASTER_KEY_HEX)
    ) {
      this.localMasterKey = Buffer.from(config.DEV_MASTER_KEY_HEX, 'hex');
    } else {
      this.localMasterKey = crypto
        .createHash('sha256')
        .update(config.JWT_SECRET)
        .digest();
    }
  }

  public isAwsKmsActive(): boolean {
    return this.kmsClient !== null && Boolean(this.kmsKeyId);
  }

  public async encryptBytes(
    plaintext: Buffer,
    aadContext: string
  ): Promise<Buffer> {
    let dekPlain: Buffer;
    let wrappedDek: Buffer;
    let mode: 'kms' | 'local';

    if (this.kmsClient && this.kmsKeyId) {
      mode = 'kms';
      const dataKeyResp = await this.kmsClient.send(
        new GenerateDataKeyCommand({
          KeyId: this.kmsKeyId,
          KeySpec: 'AES_256',
          EncryptionContext: { aad: aadContext },
        })
      );
      if (!dataKeyResp.Plaintext || !dataKeyResp.CiphertextBlob) {
        throw new Error('AWS KMS failed to generate data key');
      }
      dekPlain = Buffer.from(dataKeyResp.Plaintext);
      wrappedDek = Buffer.from(dataKeyResp.CiphertextBlob);
    } else {
      mode = 'local';
      dekPlain = crypto.randomBytes(32);
      const kekIv = crypto.randomBytes(12);
      const kekCipher = crypto.createCipheriv(
        'aes-256-gcm',
        this.localMasterKey,
        kekIv
      );
      kekCipher.setAAD(Buffer.from(`dek:${aadContext}`, 'utf8'));
      const encDek = Buffer.concat([
        kekCipher.update(dekPlain),
        kekCipher.final(),
      ]);
      const kekTag = kekCipher.getAuthTag();
      wrappedDek = Buffer.concat([kekIv, kekTag, encDek]);
    }

    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', dekPlain, iv);
      cipher.setAAD(Buffer.from(aadContext, 'utf8'));
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      const envelope: EnvelopePayloadV1 = {
        v: 1,
        mode,
        region: this.region,
        wrappedDekB64: wrappedDek.toString('base64'),
        ivB64: iv.toString('base64'),
        tagB64: tag.toString('base64'),
        ciphertextB64: ciphertext.toString('base64'),
      };

      return Buffer.from(JSON.stringify(envelope), 'utf8');
    } finally {
      dekPlain.fill(0);
    }
  }

  public async decryptBytes(
    envelopeBuffer: Buffer,
    aadContext: string
  ): Promise<Buffer> {
    const parsed = JSON.parse(
      envelopeBuffer.toString('utf8')
    ) as EnvelopePayloadV1;
    if (parsed.v !== 1) {
      throw new Error(`Unsupported envelope version: ${String(parsed.v)}`);
    }

    const wrappedDek = Buffer.from(parsed.wrappedDekB64, 'base64');
    let dekPlain: Buffer;

    if (parsed.mode === 'kms') {
      if (!this.kmsClient) {
        throw new Error(
          'AWS KMS client is not configured to decrypt KMS-wrapped payload'
        );
      }
      const decResp = await this.kmsClient.send(
        new DecryptCommand({
          CiphertextBlob: wrappedDek,
          EncryptionContext: { aad: aadContext },
        })
      );
      if (!decResp.Plaintext) {
        throw new Error('AWS KMS failed to unwrap data key');
      }
      dekPlain = Buffer.from(decResp.Plaintext);
    } else {
      const kekIv = wrappedDek.subarray(0, 12);
      const kekTag = wrappedDek.subarray(12, 28);
      const encDek = wrappedDek.subarray(28);
      const kekDecipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.localMasterKey,
        kekIv
      );
      kekDecipher.setAAD(Buffer.from(`dek:${aadContext}`, 'utf8'));
      kekDecipher.setAuthTag(kekTag);
      dekPlain = Buffer.concat([
        kekDecipher.update(encDek),
        kekDecipher.final(),
      ]);
    }

    try {
      const iv = Buffer.from(parsed.ivB64, 'base64');
      const tag = Buffer.from(parsed.tagB64, 'base64');
      const ciphertext = Buffer.from(parsed.ciphertextB64, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', dekPlain, iv);
      decipher.setAAD(Buffer.from(aadContext, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } finally {
      dekPlain.fill(0);
    }
  }

  public async encryptString(
    plaintext: string,
    aadContext: string
  ): Promise<Buffer> {
    return this.encryptBytes(Buffer.from(plaintext, 'utf8'), aadContext);
  }

  public async decryptString(
    envelopeBuffer: Buffer,
    aadContext: string
  ): Promise<string> {
    const plain = await this.decryptBytes(envelopeBuffer, aadContext);
    return plain.toString('utf8');
  }
}

export const defaultKmsEnvelope = new KmsEnvelopeService();
