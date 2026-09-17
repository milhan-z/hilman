import { S3Client } from "@aws-sdk/client-s3";

/**
 * Server-only Cloudflare R2 helpers.
 *
 * R2 speaks the S3 API, so talking to it from a Node server is talking to S3
 * with a different endpoint — there is no Cloudflare-specific SDK to reach for
 * on a host that isn't a Cloudflare Worker. `@aws-sdk/client-s3` and
 * `@aws-sdk/s3-request-presigner` are the two packages this project didn't
 * have before, and they exist for exactly this: signing one PUT request
 * without asking the client to ever hold the account's access key.
 *
 * Never import from client components — the module scope below throws if you
 * try (the config is only ever read here, once, by the /api/r2/sign route).
 */

export const R2 = {
  accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? "",
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "",
  bucket: process.env.CLOUDFLARE_R2_BUCKET ?? "",
  // No trailing slash, so callers can always write `${publicUrl}/${key}`.
  publicUrl: (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/+$/, ""),
};

export const r2ServerConfigured = Boolean(
  R2.accountId && R2.accessKeyId && R2.secretAccessKey && R2.bucket
);

let client: S3Client | null = null;

/** One client, reused — constructing it per request just repeats the same config read. */
export function r2Client(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
  });
  return client;
}
