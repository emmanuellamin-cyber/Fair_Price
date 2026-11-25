# Fair Price

The static page uses Tesseract for receipt text and a Netlify Function with the Gemini API for product photos. Photos are sent only after the user confirms in the browser. Fair Price does not save them. The Gemini API free tier has usage limits, and Google may use free-tier content to improve its products; review Google's current terms and pricing before deployment.

## Deploy image recognition

1. Deploy this folder as a Netlify site using Git integration or the Netlify CLI. A drag-and-drop static deploy does not publish the function.
2. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey) and set it in Netlify as `GEMINI_API_KEY`. Never put the key in `index.html`.
3. Deploy or redeploy the site. `netlify.toml` configures the function directory.
4. For local testing, use the Netlify CLI with the key available in your local environment, then run `netlify dev`.

The product prices, including the electric fan range, are mock demo values and are not verified local market prices.
