import { ImageResponse } from "@vercel/og";

export interface RenderMenfessOptions {
  content: string;
  id: string;
  date?: string;
  handle?: string;
}

export interface RenderMenfessPhotoOptions {
  photoBuffer: Buffer;
  photoMime?: string;
  id: string;
  date?: string;
  handle?: string;
}

function buildCardHeader(id: string, dateStr: string, paddingBottom = "32px") {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "2px solid #2f2042",
        paddingBottom,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "14px",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    width: "52px",
                    height: "52px",
                    borderRadius: "8px",
                    backgroundColor: "#f97316",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "900",
                    fontSize: "28px",
                    color: "#160a22",
                  },
                  children: "S",
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                  },
                  children: [
                    {
                      type: "span",
                      props: {
                        style: {
                          fontSize: "28px",
                          fontWeight: "800",
                          color: "#f5f0fa",
                          letterSpacing: "-0.5px",
                        },
                        children: "Stembayo Menfess",
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: {
                          fontSize: "18px",
                          color: "#bef264",
                          fontFamily: "monospace",
                          fontWeight: "700",
                        },
                        children: `#${id.slice(0, 8)}`,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              fontSize: "20px",
              color: "#9d8fa8",
              fontWeight: "500",
            },
            children: dateStr,
          },
        },
      ],
    },
  };
}

function buildCardFooter(handle: string, paddingTop = "32px") {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "2px solid #2f2042",
        paddingTop,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
            },
            children: [
              {
                type: "span",
                props: {
                  style: {
                    fontSize: "22px",
                    fontWeight: "700",
                    color: "#f97316",
                  },
                  children: handle,
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              fontSize: "18px",
              color: "#9d8fa8",
            },
            children: "Kirim pesan via link di bio",
          },
        },
      ],
    },
  };
}

export async function generateMenfessImage(options: RenderMenfessOptions): Promise<Buffer> {
  const { content, id, handle = process.env.IG_HANDLE || "@fesstembayo" } = options;
  const dateStr = options.date || new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Dynamic font sizing based on content length
  let fontSize = 42;
  if (content.length > 350) {
    fontSize = 28;
  } else if (content.length > 200) {
    fontSize = 34;
  } else if (content.length < 80) {
    fontSize = 50;
  }

  // Pure JSX structure compatible with Satori / @vercel/og
  const element: any = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#0d0914",
        backgroundImage: "radial-gradient(circle at 50% 0%, #261633 0%, #0d0914 75%)",
        color: "#f5f0fa",
        padding: "80px",
        justifyContent: "space-between",
        fontFamily: "sans-serif",
      },
      children: [
        buildCardHeader(id, dateStr, "32px"),
        // Content Body
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "40px 10px",
              flex: 1,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: `${fontSize}px`,
                    lineHeight: "1.55",
                    color: "#f5f0fa",
                    fontWeight: "400",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  },
                  children: `“${content}”`,
                },
              },
            ],
          },
        },
        buildCardFooter(handle, "32px"),
      ],
    },
  };

  const imageResponse = new ImageResponse(element, {
    width: 1080,
    height: 1080,
  });

  const arrayBuffer = await imageResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateMenfessPhotoImage(options: RenderMenfessPhotoOptions): Promise<Buffer> {
  const { photoBuffer, photoMime = "image/jpeg", id, handle = process.env.IG_HANDLE || "@fesstembayo" } = options;
  const dateStr = options.date || new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const base64Data = photoBuffer.toString("base64");
  const imgSrc = `data:${photoMime};base64,${base64Data}`;

  const element: any = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#0d0914",
        backgroundImage: "radial-gradient(circle at 50% 0%, #261633 0%, #0d0914 75%)",
        color: "#f5f0fa",
        padding: "60px 80px",
        justifyContent: "space-between",
        fontFamily: "sans-serif",
      },
      children: [
        buildCardHeader(id, dateStr, "24px"),
        // Framed Photo Body
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              flex: 1,
              padding: "24px 0",
              overflow: "hidden",
            },
            children: [
              {
                type: "img",
                props: {
                  src: imgSrc,
                  style: {
                    width: "100%",
                    height: "720px",
                    objectFit: "cover",
                    borderRadius: "16px",
                    border: "3px solid #36224c",
                  },
                },
              },
            ],
          },
        },
        buildCardFooter(handle, "24px"),
      ],
    },
  };

  const imageResponse = new ImageResponse(element, {
    width: 1080,
    height: 1080,
  });

  const arrayBuffer = await imageResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
