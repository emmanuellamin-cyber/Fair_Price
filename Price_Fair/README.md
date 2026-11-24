# Fair Price

The static page uses Tesseract for receipt text and a Netlify Function with OpenAI vision for product photos. Photos are sent only after the user confirms in the browser. The app does not save them. OpenAI's processing is subject to its own policies.

## Deploy image recognition

1. Deploy this folder as a Netlify site using Git integration or the Netlify CLI. A drag-and-drop static deploy does not publish the function.
2. In Netlify, set the environment variable `OPENAI_API_KEY` to your OpenAI API key. Never put the key in `index (1).html`.
3. Deploy or redeploy the site. `netlify.toml` configures the function directory.
4. For local testing, use the Netlify CLI with the key available in your local environment, then run `netlify dev`.

The product prices, including the electric fan range, are mock demo values and are not verified local market prices.
