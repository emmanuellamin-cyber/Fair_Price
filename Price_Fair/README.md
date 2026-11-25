# Fair Price

The static page uses Tesseract for receipt text and a Cloudflare Pages Function with the Gemini API for product photos. Photos are sent only after the user confirms in the browser. Fair Price does not save them. The Gemini API free tier has usage limits, and Google may use free-tier content to improve its products; review Google's current terms and pricing before deployment.

## Deploy on Cloudflare Pages

1. Create a Cloudflare Pages project named `fair-price` from this GitHub repository using Git integration. Direct Upload does not support Pages Functions.
2. Leave the build command empty and set the build output directory to `Price_Fair`. `wrangler.jsonc` records this output directory.
3. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). In Cloudflare, add it as a secret named `GEMINI_API_KEY` for production and, if used, preview deployments. Never put the key in `index.html` or `wrangler.jsonc`.
4. Deploy or redeploy the project. The function in `functions/api/recognize.js` handles requests at `/api/recognize`.

The product prices, including the electric fan range, are mock demo values and are not verified local market prices.
