import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function getMaxUploadBytes() {
  return Number(process.env.MAX_UPLOAD_BYTES ?? 52_428_800);
}

export function getS3Bucket() {
  return requireEnv("AWS_S3_BUCKET");
}

export function isS3Configured() {
  return Boolean(
    process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET
  );
}

function getLocalStorageRoot() {
  return path.resolve(process.cwd(), ".storage");
}

function getLocalObjectPath(key: string) {
  const root = getLocalStorageRoot();
  const objectPath = path.resolve(root, key);

  if (!objectPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid storage key.");
  }

  return objectPath;
}

export function getS3Client() {
  return new S3Client({
    region: requireEnv("AWS_REGION"),
    endpoint: process.env.AWS_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY")
    }
  });
}

export function getObjectUrl(key: string) {
  if (!isS3Configured()) {
    return `local://${key}`;
  }

  if (process.env.AWS_S3_PUBLIC_BASE_URL) {
    return `${process.env.AWS_S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }

  return `s3://${getS3Bucket()}/${key}`;
}

export async function uploadObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  contentLength: number;
}) {
  if (!isS3Configured()) {
    const objectPath = getLocalObjectPath(input.key);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, input.body);

    return getObjectUrl(input.key);
  }

  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      ServerSideEncryption: "AES256"
    })
  );

  return getObjectUrl(input.key);
}

export async function deleteObject(key: string) {
  if (!isS3Configured()) {
    await rm(getLocalObjectPath(key), { force: true });
    return;
  }

  const client = getS3Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: getS3Bucket(),
      Key: key
    })
  );
}

export async function getDownloadUrl(key: string, fileName: string) {
  if (!isS3Configured()) {
    throw new Error("Signed download URLs are only available when S3 is configured.");
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 5 });
}

export async function getDownloadResponse(key: string, fileName: string, contentType: string) {
  if (isS3Configured()) {
    return Response.redirect(await getDownloadUrl(key, fileName), 302);
  }

  const body = await readFile(getLocalObjectPath(key));
  const safeFileName = fileName.replace(/"/g, "");

  return new Response(body, {
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="${safeFileName}"`
    }
  });
}
