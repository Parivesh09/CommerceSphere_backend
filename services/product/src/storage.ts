import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';
import { createLogger, CircuitBreaker, CircuitBreakerOpenError } from '@commercesphere/utils';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({ serviceName: 'product-service' });

class StorageService {
  private s3Client: S3Client;
  private bucket: string;
  private cdnBaseUrl: string;
  private uploadUrlCircuitBreaker: CircuitBreaker<[string, string], { uploadUrl: string; key: string }>;
  private deleteCircuitBreaker: CircuitBreaker<[string], void>;

  constructor() {
    const s3Config: {
      region: string;
      credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
      };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      region: config.s3.region,
    };


    if (config.s3.accessKeyId && config.s3.secretAccessKey) {
      s3Config.credentials = {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      };
    }


    if (config.s3.endpoint) {
      s3Config.endpoint = config.s3.endpoint;
      s3Config.forcePathStyle = true; // Required for MinIO
    }

    this.s3Client = new S3Client(s3Config);
    this.bucket = config.s3.bucket;
    this.cdnBaseUrl = config.cdn.baseUrl;


    this.uploadUrlCircuitBreaker = new CircuitBreaker(
      this.generateUploadUrlInternal.bind(this),
      {
        name: 's3-upload-url-generation',
        failureThreshold: 5,
        failureTimeWindowMs: 10000,
        resetTimeoutMs: 60000,
        halfOpenMaxAttempts: 3,
        onStateChange: (state) => {
          logger.warn('S3 upload URL circuit breaker state changed', { state });
        },
      }
    );

    this.deleteCircuitBreaker = new CircuitBreaker(
      this.deleteImageInternal.bind(this),
      {
        name: 's3-delete-image',
        failureThreshold: 5,
        failureTimeWindowMs: 10000,
        resetTimeoutMs: 60000,
        halfOpenMaxAttempts: 3,
        onStateChange: (state) => {
          logger.warn('S3 delete circuit breaker state changed', { state });
        },
      }
    );
  }

  /**
   * Generate a pre-signed URL for uploading an image
   * @param productId - The product ID
   * @param fileExtension - The file extension (e.g., 'jpg', 'png')
   * @returns Pre-signed URL and the object key
   */
  async generateUploadUrl(productId: string, fileExtension: string): Promise<{ uploadUrl: string; key: string }> {
    try {
      return await this.uploadUrlCircuitBreaker.execute(productId, fileExtension);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        logger.error('S3 upload URL generation circuit breaker is open', {
          productId,
          error: error.message,
        });

        throw new Error('Image upload service is temporarily unavailable. Please try again later.');
      }
      throw error;
    }
  }

  /**
   * Internal method for generating upload URL (wrapped by circuit breaker)
   */
  private async generateUploadUrlInternal(productId: string, fileExtension: string): Promise<{ uploadUrl: string; key: string }> {
    const key = `products/${productId}/${uuidv4()}.${fileExtension}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: this.getContentType(fileExtension),
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: config.s3.presignedUrlExpiration,
    });

    logger.info('Generated pre-signed upload URL', { productId, key });

    return { uploadUrl, key };
  }

  /**
   * Delete an image from storage
   * @param key - The object key in S3
   */
  async deleteImage(key: string): Promise<void> {
    try {
      await this.deleteCircuitBreaker.execute(key);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        logger.error('S3 delete circuit breaker is open', {
          key,
          error: error.message,
        });

        logger.warn('Image deletion deferred due to S3 unavailability', { key });
        return;
      }
      throw error;
    }
  }

  /**
   * Internal method for deleting image (wrapped by circuit breaker)
   */
  private async deleteImageInternal(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
    logger.info('Deleted image from storage', { key });
  }

  /**
   * Get the public URL for an image (CDN or direct S3)
   * @param key - The object key in S3
   * @returns The public URL
   */
  getImageUrl(key: string): string {
    if (this.cdnBaseUrl) {
      return `${this.cdnBaseUrl}/${key}`;
    }
    

    if (config.s3.endpoint) {
      return `${config.s3.endpoint}/${this.bucket}/${key}`;
    }
    
    return `https://${this.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
  }

  /**
   * Extract the S3 key from a full URL
   * @param url - The full image URL
   * @returns The S3 key or null if not a valid URL
   */
  extractKeyFromUrl(url: string): string | null {
    try {

      if (this.cdnBaseUrl && url.startsWith(this.cdnBaseUrl)) {
        return url.substring(this.cdnBaseUrl.length + 1);
      }


      const s3Pattern = new RegExp(`https://${this.bucket}\\.s3\\.${config.s3.region}\\.amazonaws\\.com/(.+)`);
      const match = url.match(s3Pattern);
      if (match) {
        return match[1];
      }


      if (config.s3.endpoint) {
        const endpointPattern = new RegExp(`${config.s3.endpoint}/${this.bucket}/(.+)`);
        const endpointMatch = url.match(endpointPattern);
        if (endpointMatch) {
          return endpointMatch[1];
        }
      }

      return null;
    } catch (error) {
      logger.error('Error extracting key from URL', { url, error });
      return null;
    }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(extension: string): string {
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };

    return contentTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}

export const storageService = new StorageService();
