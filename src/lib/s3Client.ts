import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import type { LedgerRecord } from '../types/ledger'

export const BUCKET_NAME = 'eyoba-ledger-storage'

export function getS3Client(): S3Client {
  return new S3Client({
    endpoint:
      import.meta.env.VITE_AWS_ENDPOINT_URL_S3 ||
      'https://br-long-term-b5t67vx7.storage.c-7.us-east-2.aws.neon.tech',
    region: import.meta.env.VITE_AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId:
        import.meta.env.VITE_AWS_ACCESS_KEY_ID ||
        'nak_live_2cf879755bd14d26ad50b8abcf9bed65',
      secretAccessKey:
        import.meta.env.VITE_AWS_SECRET_ACCESS_KEY ||
        'nsk_live_c99483e16e135495d984b5acbed50888792ee2dc7f0a6f574106eea8b27544c3',
    },
    forcePathStyle: true,
  })
}

export async function uploadBackupToS3(
  records: LedgerRecord[],
): Promise<string> {
  const s3 = getS3Client()
  const filename = `backups/eyoba-ledger-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const body = JSON.stringify(records, null, 2)

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: body,
      ContentType: 'application/json',
    }),
  )

  return filename
}
