export interface InstagramPublishResult {
  mediaId: string;
  permalink: string;
}

const GRAPH_API_VERSION = "v19.0";

export async function publishToInstagram(options: {
  imageUrl: string;
  caption: string;
}): Promise<InstagramPublishResult> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  // Development / Mock fallback if credentials not yet configured
  if (!accountId || !accessToken) {
    console.warn(
      "[Instagram] Meta credentials missing. Simulating successful publish for dev."
    );
    const mockId = "mock_ig_" + Date.now();
    return {
      mediaId: mockId,
      permalink: `https://www.instagram.com/p/${mockId}/`,
    };
  }

  // Step 1: Create media container
  const createContainerUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/media`;
  const containerParams = new URLSearchParams({
    image_url: options.imageUrl,
    caption: options.caption,
    access_token: accessToken,
  });

  const createRes = await fetch(createContainerUrl, {
    method: "POST",
    body: containerParams,
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create Instagram container (${createRes.status}): ${err}`);
  }

  const containerData = (await createRes.json()) as { id: string };
  const creationId = containerData.id;

  // Step 2: Dynamic readiness polling (up to 5 attempts, 1s interval)
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const statusUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${creationId}?fields=status_code&access_token=${accessToken}`;
      const statusRes = await fetch(statusUrl);
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { status_code?: string };
        if (statusData.status_code === "FINISHED") {
          break;
        } else if (statusData.status_code === "ERROR") {
          throw new Error("Meta reported container upload status ERROR");
        }
      }
    } catch (e: any) {
      if (e.message.includes("ERROR")) throw e;
    }
  }

  // Step 3: Publish the media container
  const publishUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${accountId}/media_publish`;
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });

  const publishRes = await fetch(publishUrl, {
    method: "POST",
    body: publishParams,
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Failed to publish Instagram media (${publishRes.status}): ${err}`);
  }

  const publishData = (await publishRes.json()) as { id: string };
  const mediaId = publishData.id;

  // Step 4: Fetch permalink
  let permalink = `https://www.instagram.com/`;
  try {
    const mediaInfoUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}?fields=permalink&access_token=${accessToken}`;
    const infoRes = await fetch(mediaInfoUrl);
    if (infoRes.ok) {
      const infoData = (await infoRes.json()) as { permalink: string };
      permalink = infoData.permalink;
    }
  } catch (e) {
    console.error("[Instagram] Warning: could not fetch permalink:", e);
  }

  return { mediaId, permalink };
}

export async function deleteFromInstagram(mediaId: string): Promise<boolean> {
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!accessToken || mediaId.startsWith("mock_")) {
    console.log(`[Instagram] Deleted mock media: ${mediaId}`);
    return true;
  }

  const deleteUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}?access_token=${accessToken}`;
  const res = await fetch(deleteUrl, { method: "DELETE" });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to delete Instagram media (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { success: boolean };
  return data.success;
}
