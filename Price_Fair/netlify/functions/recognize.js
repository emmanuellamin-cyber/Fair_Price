const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Use POST to recognize an image." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return response(503, { error: "Image recognition is not configured on this site." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "");
  } catch {
    return response(400, { error: "The request body must be valid JSON." });
  }

  if (!body || typeof body.image !== "string" || !ALLOWED_TYPES.has(body.mimeType)) {
    return response(400, { error: "Provide a supported image and MIME type." });
  }

  const encoded = body.image.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    return response(400, { error: "The image data is not valid base64." });
  }
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    return response(413, { error: "The image must be smaller than 5 MB." });
  }

  const image = Buffer.from(encoded, "base64");
  if (!image.length || image.length > MAX_IMAGE_BYTES) {
    return response(413, { error: "The image must be smaller than 5 MB." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: 'Look at the image. If it is a receipt or shopping list, return {"isReceipt":true,"product":null}. Otherwise identify the main physical product in a short common name. If uncertain or no product is visible, return {"isReceipt":false,"product":null}. Never guess a price. Return only JSON.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify the main product, or tell me if this is a receipt." },
              {
                type: "image_url",
                image_url: {
                  url: `data:${body.mimeType};base64,${image.toString("base64")}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 100,
      }),
    });
  } catch (error) {
    clearTimeout(timeout);
    return response(error.name === "AbortError" ? 504 : 502, {
      error: error.name === "AbortError"
        ? "Image recognition timed out. Try again or choose an item manually."
        : "Could not reach the image recognition service.",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    return response(502, { error: "The image recognition service could not process this photo." });
  }

  let result;
  try {
    const data = await upstream.json();
    result = JSON.parse(data.choices?.[0]?.message?.content || "");
  } catch {
    return response(502, { error: "The image recognition service returned an unreadable result." });
  }

  if (!result || typeof result.isReceipt !== "boolean" ||
      (result.product !== null && typeof result.product !== "string")) {
    return response(502, { error: "The image recognition service returned an invalid result." });
  }

  return response(200, {
    isReceipt: result.isReceipt,
    product: typeof result.product === "string" ? result.product.trim().slice(0, 80) || null : null,
  });
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
