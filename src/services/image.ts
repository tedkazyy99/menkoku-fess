export interface RenderMenfessOptions {
  content: string;
  id: string;
  date?: string;
  handle?: string;
}

export async function generateMenfessImage(options: RenderMenfessOptions): Promise<Buffer> {
  const { ImageResponse } = await import("@vercel/og");
  const { content, id, handle = "@yourmenfess" } = options;
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
        backgroundColor: "#09090b",
        backgroundImage: "radial-gradient(circle at 50% 0%, #1e1b4b 0%, #09090b 70%)",
        color: "#f4f4f5",
        padding: "80px",
        justifyContent: "space-between",
        fontFamily: "sans-serif",
      },
      children: [
        // Header
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #27272a",
              paddingBottom: "32px",
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
                          width: "48px",
                          height: "48px",
                          borderRadius: "24px",
                          backgroundColor: "#6366f1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "bold",
                          fontSize: "24px",
                          color: "#ffffff",
                        },
                        children: "M",
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
                                fontWeight: "700",
                                color: "#ffffff",
                                letterSpacing: "-0.5px",
                              },
                              children: "Menfesskan",
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: {
                                fontSize: "18px",
                                color: "#a1a1aa",
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
                    color: "#71717a",
                    fontWeight: "500",
                  },
                  children: dateStr,
                },
              },
            ],
          },
        },

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
                    lineHeight: "1.5",
                    color: "#fafafa",
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

        // Footer
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid #27272a",
              paddingTop: "32px",
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
                          fontWeight: "600",
                          color: "#818cf8",
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
                    color: "#71717a",
                  },
                  children: "Kirim pesan anonim via link di bio",
                },
              },
            ],
          },
        },
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

