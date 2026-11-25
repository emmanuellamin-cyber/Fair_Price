const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse(503, { error: "Gemini image recognition is not configured on this site." });
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let upstream;
  try {
    upstream = await fetch(GEMINI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: 'Look at the image. If it is a receipt or shopping list, return {"isReceipt":true,"product":null}. Otherwise identify the main physical product in a short common name. If uncertain or no product is visible, return {"isReceipt":false,"product":null}. Never guess a price.',
          }],
        },
        contents: [{
          role: "user",
          parts: [
            { text: "Identify the main product, or tell me if this is a receipt." },
            { inlineData: { mimeType: body.mimeType, data: encoded } },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 100,
        },
      }),
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Could not reach the Gemini image recognition service.", { name: error.name });
    }
    return jsonResponse(error.name === "AbortError" ? 504 : 502, {
      error: error.name === "AbortError"
        ? "Image recognition timed out. Try again or choose an item manually."
        : "Could not reach the Gemini image recognition service.",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    let data;
    try {
      data = await upstream.json();
    } catch (error) {
      console.error("Gemini returned an unreadable error response.", {
        status: upstream.status,
        name: error.name,
      });
      return jsonResponse(502, {
        error: `Gemini returned an unreadable error response (HTTP ${upstream.status}).`,
      });
    }

    const details = data && data.error && typeof data.error === "object" ? data.error : {};
    const code = typeof details.status === "string"
      ? details.status.slice(0, 80)
      : typeof details.code === "string" ? details.code.slice(0, 80) : null;
    console.error("Gemini image recognition request failed.", { status: upstream.status, code });

    let message;
    if (upstream.status === 401) {
      message = "Gemini rejected the API key. Check that GEMINI_API_KEY in Cloudflare is valid.";
    } else if (upstream.status === 403) {
      message = "Gemini denied access. Check the API project's permissions and model access.";
    } else if (upstream.status === 429) {
      message = "Gemini usage or rate limits were reached. Check AI Studio quota and limits.";
    } else if (code) {
      message = `Gemini rejected the request (HTTP ${upstream.status}, ${code}). Check the model, API access, and function logs.`;
    } else {
      message = `Gemini image recognition failed (HTTP ${upstream.status}). Check function logs.`;
    }

    return jsonResponse(502, { error: message, providerStatus: upstream.status, providerCode: code });
  }

  let result;
  try {
    const data = await upstream.json();
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => typeof part.text === "string" ? part.text : "")
      .join("");
    result = JSON.parse(text || "");
  } catch {
    return jsonResponse(502, { error: "Gemini returned an unreadable result." });
  }

  if (!result || typeof result.isReceipt !== "boolean" ||
      (result.product !== null && typeof result.product !== "string")) {
    return jsonResponse(502, { error: "Gemini returned an invalid result." });
  }

  return jsonResponse(200, {
    isReceipt: result.isReceipt,
    product: typeof result.product === "string" ? result.product.trim().slice(0, 80) || null : null,
  });
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
