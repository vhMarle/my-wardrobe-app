const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.use(express.static(path.join(__dirname, 'public')));

// Helper to extract meta tags from scraped HTML
function extractMetaTag(html, property) {
  const match = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
                html.match(new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

// URL Scraping & Metadata Extraction Endpoint
app.post('/api/scrape-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    // Fetch product page HTML with browser headers
    const pageResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const contentType = pageResponse.headers.get('content-type') || '';

    let imageUrl = '';
    let pageTitle = '';
    let scrapedBrand = '';

    // If direct image URL provided
    if (contentType.startsWith('image/')) {
      imageUrl = url;
    } else {
      const html = await pageResponse.text();
      imageUrl = extractMetaTag(html, 'og:image') || extractMetaTag(html, 'twitter:image') || '';
      pageTitle = extractMetaTag(html, 'og:title') || extractMetaTag(html, 'twitter:title') || '';
      scrapedBrand = extractMetaTag(html, 'og:site_name') || extractMetaTag(html, 'og:brand') || '';

      // Fallback relative image URL handling
      if (imageUrl && !imageUrl.startsWith('http')) {
        const urlObj = new URL(url);
        imageUrl = `${urlObj.origin}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
      }
    }

    if (!imageUrl) {
      return res.status(400).json({ success: false, error: 'Could not extract product image from URL.' });
    }

    // Convert scraped image to Base64 buffer
    const imgResponse = await fetch(imageUrl);
    const imgBuffer = await imgResponse.buffer();
    const mimeType = imgResponse.headers.get('content-type') || 'image/jpeg';
    const base64Image = `data:${mimeType};base64,${imgBuffer.toString('base64')}`;

    // Auto-detect store name from domain URL
    let domainBrand = '';
    try {
      const parsedUrl = new URL(url);
      domainBrand = parsedUrl.hostname.replace('www.', '').split('.')[0];
      domainBrand = domainBrand.charAt(0).toUpperCase() + domainBrand.slice(1);
    } catch (e) {}

    res.json({
      success: true,
      base64Image,
      metadata: {
        title: pageTitle,
        brand: scrapedBrand || domainBrand,
        store: domainBrand
      }
    });
  } catch (err) {
    console.error('Scrape Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI Auto-Tagging API Endpoint
app.post('/api/analyze-clothing', async (req, res) => {
  try {
    const { base64Image, metadata } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'OpenAI API key missing on server.' });
    }

    const contextText = metadata ? `Context from Web Page - Title: "${metadata.title}", Detected Retailer: "${metadata.store}".` : '';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this clothing/accessory photo. ${contextText} Identify: 1. Color name, 2. Brand name (check visible tags or context), 3. Size (return "Unknown" if not visible), 4. Where bought/retailer name, 5. Category (must be one of: Clothing, Jackets/Coats, Shoes, Necklaces, Bangles, Earrings, Other). Output strictly valid JSON with keys: "color", "brand", "size", "whereBought", "category".`
              },
              {
                type: 'image_url',
                image_url: { url: base64Image }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 250
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const details = JSON.parse(data.choices[0].message.content);
    res.json({ success: true, details });
  } catch (err) {
    console.error('AI Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Wardrobe Server running at http://localhost:${PORT}`);
});
