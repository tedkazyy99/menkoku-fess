import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

export async function uploadImageToCloud(
  buffer: Buffer,
  filename: string
): Promise<{ url: string; publicId?: string }> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "[Storage] Cloudinary credentials missing! Harap konfigurasi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET di .env"
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "menfess";

  // Generate SHA-1 signature required by Cloudinary
  const stringToSign = `folder=${folder}&public_id=${filename}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(stringToSign).digest("hex");

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "image/png" });
  formData.append("file", blob, `${filename}.png`);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp.toString());
  formData.append("signature", signature);
  formData.append("folder", folder);
  formData.append("public_id", filename);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Cloudinary upload failed (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as any;
  return {
    url: data.secure_url || data.url,
    publicId: data.public_id,
  };
}
