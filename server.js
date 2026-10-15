const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// AI Auto-Tagging Endpoint
app.post('/api/analyze-clothing', async (req, res) => {
  try {
    const { base64Image } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'OpenAI API key missing on server.' });
    }

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
                text: 'Analyze this clothing item photo. Identify: 1. Primary color name, 2. Brand name (look for visible logos or clothing tags; return "Unknown" if not clearly visible), 3. Size (return "Unknown" unless tag is visible), 4. Where bought/retailer (if tag or brand indicates it, else "Unknown"), 5. Category (must be one of: Tops, Bottoms, Shoes, Outerwear, Accessories). Output strictly valid JSON matching keys: "color", "brand", "size", "whereBought", "category".'
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
