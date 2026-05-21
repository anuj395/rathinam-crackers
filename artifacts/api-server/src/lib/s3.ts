import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION ?? "";
const client = new S3Client({ region: REGION });

export async function uploadToS3(bucket: string, key: string, body: Buffer | Uint8Array, contentType: string) {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await client.send(cmd);
}

export async function deleteFromS3(bucket: string, key: string) {
  const cmd = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await client.send(cmd);
}

export function s3PublicUrl(bucket: string, region: string | undefined, key: string) {
  if (!region) return `https://${bucket}.s3.amazonaws.com/${key}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export { REGION };

export async function getPresignedGetUrl(bucket: string, key: string, expiresInSeconds = 3600) {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
}
