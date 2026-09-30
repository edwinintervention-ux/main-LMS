import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const prompt = `You are an AI assistant that extracts information from Kenyan National Identity Cards (ID cards).

Analyze the provided image and extract the following fields:
- Full name (as printed on the card)
- ID number (the 8-digit national ID number)
- Date of birth (in YYYY-MM-DD format, e.g. 1990-05-14)
- Gender (Male or Female)

Return ONLY a JSON object with these exact keys: name, idNo, dob, gender.
If a field is not clearly visible or readable, return an empty string for that field.

Example response:
{
  "name": "JOHN KAMAU NJOROGE",
  "idNo": "12345678",
  "dob": "1990-05-14",
  "gender": "Male"
}

Do not include any explanation or markdown — only the raw JSON object.`;

    const models = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-flash-lite-latest'];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: imageBase64
                    }
                  }
                ]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 300
              }
            })
          }
        );

        if (!response.ok) {
          lastError = await response.text();
          continue;
        }

        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Clean potential markdown code fences
        const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          // Try to extract JSON from the text
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) {
            parsed = JSON.parse(match[0]);
          } else {
            lastError = 'Could not parse response as JSON: ' + text;
            continue;
          }
        }

        // Normalize the name to title case
        if (parsed.name) {
          parsed.name = parsed.name
            .toLowerCase()
            .split(' ')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        }

        // Validate ID number is numeric
        if (parsed.idNo) {
          parsed.idNo = parsed.idNo.replace(/\D/g, '');
        }

        return new Response(JSON.stringify({ success: true, data: parsed }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        lastError = err.message;
        continue;
      }
    }

    return new Response(JSON.stringify({ error: 'All models failed: ' + lastError }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
