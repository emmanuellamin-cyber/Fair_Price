const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

export async function onRequestPost({ request, env }) {
  if (!env.AI || typeof env.AI.run !== "function") {
    return jsonResponse(503, { error: "Cloudflare Workers AI is not configured on this site." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "The request body must be valid JSON." });
  }

  if (!body || typeof body.image !== "string" || !ALLOWED_TYPES.has(body.mimeType)) {
    return jsonResponse(400, { error: "Provide a supported image and MIME type." });
  }

  const encoded = body.image.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    return jsonResponse(400, { error: "The image data is not valid base64." });
  }
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    return jsonResponse(413, { error: "The image must be smaller than 5 MB." });
  }

  let image;
  try {
    image = atob(encoded);
  } catch {
    return jsonResponse(400, { error: "The image data is not valid base64." });
  }
  if (!image.length || image.length > MAX_IMAGE_BYTES) {
    return jsonResponse(413, { error: "The image must be smaller than 5 MB." });
  }

  let output;
  try {
    output = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: 'Look at the image. If it is a receipt or shopping list, return {"isReceipt":true,"product":null}. Otherwise identify the main physical product in a short common name. If uncertain or no product is visible, return {"isReceipt":false,"product":null}. Never guess a price. Reply with only one JSON object, without markdown.',
        },
        { role: "user", content: "Identify the main product, or tell me if this is a receipt." },
      ],
      image: `data:${body.mimeType};base64,${encoded}`,
      max_tokens: 100,
      temperature: 0,
    });
  } catch (error) {
    console.error("Cloudflare Workers AI image recognition failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message.slice(0, 200) : "Unknown error",
    });
    return jsonResponse(502, {
      error: "Cloudflare Workers AI could not process this image. Check the AI binding, model access, and function logs.",
    });
  }

  let result;
  try {
    const responseText = typeof output === "string" ? output
      : typeof output?.response === "string" ? output.response
      : typeof output?.result === "string" ? output.result
      : typeof output?.result?.response === "string" ? output.result.response
      : null;
    result = parseModelResponse(responseText);
  } catch {
    return jsonResponse(502, { error: "Cloudflare Workers AI returned an unreadable result." });
  }

  if (!result || typeof result.isReceipt !== "boolean" ||
      (result.product !== null && typeof result.product !== "string")) {
    return jsonResponse(502, { error: "Cloudflare Workers AI returned an invalid result." });
  }

  return jsonResponse(200, {
    isReceipt: result.isReceipt,
    product: typeof result.product === "string" ? result.product.trim().slice(0, 80) || null : null,
  });
}

function parseModelResponse(response) {
  if (typeof response !== "string") {
    throw new Error("The model response was not text.");
  }

  const text = response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) {
      throw new Error("The model response did not contain JSON.");
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
